"""
Browser Automation Base

Base classes and utilities for browser-based job application automation.
"""

import asyncio
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional, Any
from pydantic import BaseModel, Field
from playwright.async_api import async_playwright, Browser, Page, BrowserContext


class ApplicationStatus(str, Enum):
    """Status of a job application attempt."""
    SUCCESS = "success"          # Application submitted successfully
    DRAFT = "draft"              # Created draft, needs manual completion
    LOGIN_REQUIRED = "login_required"  # Hit login wall
    CAPTCHA_BLOCKED = "captcha_blocked"  # Blocked by captcha
    FORM_ERROR = "form_error"    # Error filling form
    TIMEOUT = "timeout"          # Page load timeout
    FAILED = "failed"            # General failure


class FormFieldType(str, Enum):
    """Types of form fields we can fill."""
    TEXT = "text"
    EMAIL = "email"
    PHONE = "phone"
    FILE = "file"
    SELECT = "select"
    RADIO = "radio"
    CHECKBOX = "checkbox"
    TEXTAREA = "textarea"


class FormField(BaseModel):
    """A form field detected on the application page."""
    name: str
    field_type: FormFieldType
    label: Optional[str] = None
    required: bool = False
    options: list[str] = Field(default_factory=list)  # For select/radio
    selector: Optional[str] = None


class ApplicationResult(BaseModel):
    """Result of a job application attempt."""
    status: ApplicationStatus
    job_url: str
    company: Optional[str] = None
    job_title: Optional[str] = None
    screenshot_path: Optional[str] = None
    screenshot_url: Optional[str] = None
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    fields_filled: int = 0
    fields_missing: list[str] = Field(default_factory=list)
    application_id: Optional[str] = None  # Platform-specific ID if available


class UserProfile(BaseModel):
    """User profile data for filling applications."""
    # Basic info
    first_name: str
    last_name: str
    email: str
    phone: str

    # Optional info
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None

    # Professional
    current_title: Optional[str] = None
    years_experience: Optional[int] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None

    # Education
    degree: Optional[str] = None
    university: Optional[str] = None
    graduation_year: Optional[int] = None

    # Work authorization
    authorized_to_work: bool = True
    requires_sponsorship: bool = False
    willing_to_relocate: bool = True


class ApplicationRequest(BaseModel):
    """Request to apply to a job."""
    job_url: str
    profile: UserProfile
    resume_path: Optional[str] = None
    cover_letter: Optional[str] = None

    # Optional: Platform credentials for authenticated applications
    session_cookies: Optional[dict[str, str]] = None
    platform: Optional[str] = None  # linkedin, indeed, glassdoor, etc.

    # Options
    take_screenshot: bool = True
    dry_run: bool = False  # If true, fill form but don't submit


class BrowserManager:
    """Manages Playwright browser instances."""

    def __init__(self, headless: bool = True, assets_dir: str = "/app/assets"):
        self.headless = headless
        self.assets_dir = Path(assets_dir)
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        self._playwright = None
        self._browser: Optional[Browser] = None

    async def start(self):
        """Start the browser."""
        if self._browser is None:
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                ]
            )

    async def stop(self):
        """Stop the browser."""
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

    async def new_context(
        self,
        cookies: Optional[dict[str, str]] = None,
        user_agent: Optional[str] = None
    ) -> BrowserContext:
        """Create a new browser context with optional cookies."""
        await self.start()

        context = await self._browser.new_context(
            user_agent=user_agent or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={'width': 1920, 'height': 1080},
            locale='en-US',
        )

        if cookies:
            cookie_list = [
                {
                    'name': name,
                    'value': value,
                    'domain': '.linkedin.com',  # Adjust per platform
                    'path': '/',
                }
                for name, value in cookies.items()
            ]
            await context.add_cookies(cookie_list)

        return context

    async def take_screenshot(
        self,
        page: Page,
        prefix: str = "screenshot"
    ) -> tuple[str, str]:
        """Take a screenshot and return (path, url)."""
        screenshot_id = str(uuid.uuid4())[:8]
        filename = f"{prefix}_{screenshot_id}.png"
        screenshot_path = self.assets_dir / filename
        await page.screenshot(path=str(screenshot_path), full_page=True)
        screenshot_url = f"/assets/{filename}"
        return str(screenshot_path), screenshot_url


class JobApplicator(ABC):
    """Abstract base class for platform-specific job applicators."""

    def __init__(self, browser_manager: BrowserManager):
        self.browser = browser_manager

    @abstractmethod
    async def detect_platform(self, page: Page) -> bool:
        """Detect if the page belongs to this platform."""
        pass

    @abstractmethod
    async def apply(self, request: ApplicationRequest) -> ApplicationResult:
        """Apply to a job using this platform's flow."""
        pass

    @abstractmethod
    async def detect_form_fields(self, page: Page) -> list[FormField]:
        """Detect form fields on the application page."""
        pass

    async def fill_common_fields(self, page: Page, profile: UserProfile) -> int:
        """Fill common form fields. Returns number of fields filled."""
        filled = 0

        field_mapping = {
            # Name fields
            'first_name': ['first_name', 'firstname', 'given_name', 'fname'],
            'last_name': ['last_name', 'lastname', 'family_name', 'lname', 'surname'],
            'email': ['email', 'email_address', 'emailaddress'],
            'phone': ['phone', 'phone_number', 'phonenumber', 'mobile', 'telephone'],
            'city': ['city', 'location_city'],
            'state': ['state', 'province', 'region'],
            'zip_code': ['zip', 'zipcode', 'postal', 'postalcode'],
            'linkedin_url': ['linkedin', 'linkedin_url', 'linkedinurl'],
            'current_title': ['current_title', 'job_title', 'title', 'position'],
        }

        for field, selectors in field_mapping.items():
            value = getattr(profile, field, None)
            if value:
                for selector in selectors:
                    try:
                        # Try various selector patterns
                        for pattern in [
                            f'input[name*="{selector}" i]',
                            f'input[id*="{selector}" i]',
                            f'input[placeholder*="{selector}" i]',
                            f'input[aria-label*="{selector}" i]',
                        ]:
                            element = page.locator(pattern).first
                            if await element.is_visible(timeout=500):
                                await element.fill(str(value))
                                filled += 1
                                break
                    except Exception:
                        continue

        return filled

    async def upload_resume(self, page: Page, resume_path: str) -> bool:
        """Upload a resume file."""
        if not resume_path or not os.path.exists(resume_path):
            return False

        try:
            # Common resume upload selectors
            upload_selectors = [
                'input[type="file"][accept*="pdf"]',
                'input[type="file"][name*="resume" i]',
                'input[type="file"][name*="cv" i]',
                'input[type="file"][id*="resume" i]',
                'input[type="file"]',
            ]

            for selector in upload_selectors:
                try:
                    file_input = page.locator(selector).first
                    if await file_input.count() > 0:
                        await file_input.set_input_files(resume_path)
                        return True
                except Exception:
                    continue

            return False
        except Exception:
            return False

    async def check_for_blockers(self, page: Page) -> Optional[ApplicationStatus]:
        """Check for common blockers like login walls or captchas."""
        content = await page.content()
        url = page.url.lower()

        # Login wall detection
        login_indicators = [
            'sign in to apply',
            'login to apply',
            'sign in required',
            'please log in',
            '/login',
            '/signin',
        ]
        for indicator in login_indicators:
            if indicator in content.lower() or indicator in url:
                return ApplicationStatus.LOGIN_REQUIRED

        # Captcha detection
        captcha_indicators = [
            'captcha',
            'recaptcha',
            'hcaptcha',
            'challenge-running',
            'cf-turnstile',
        ]
        for indicator in captcha_indicators:
            if indicator in content.lower():
                return ApplicationStatus.CAPTCHA_BLOCKED

        return None


class GenericApplicator(JobApplicator):
    """Generic job applicator for unknown platforms."""

    async def detect_platform(self, page: Page) -> bool:
        """Always returns True as fallback."""
        return True

    async def detect_form_fields(self, page: Page) -> list[FormField]:
        """Detect all form fields on the page."""
        fields = []

        # Find all input fields
        inputs = await page.locator('input:visible, textarea:visible, select:visible').all()

        for element in inputs:
            try:
                tag = await element.evaluate('el => el.tagName.toLowerCase()')
                input_type = await element.get_attribute('type') or 'text'
                name = await element.get_attribute('name') or await element.get_attribute('id') or ''
                placeholder = await element.get_attribute('placeholder') or ''
                required = await element.get_attribute('required') is not None

                # Determine field type
                if tag == 'select':
                    field_type = FormFieldType.SELECT
                elif tag == 'textarea':
                    field_type = FormFieldType.TEXTAREA
                elif input_type == 'file':
                    field_type = FormFieldType.FILE
                elif input_type == 'email':
                    field_type = FormFieldType.EMAIL
                elif input_type == 'tel':
                    field_type = FormFieldType.PHONE
                elif input_type == 'radio':
                    field_type = FormFieldType.RADIO
                elif input_type == 'checkbox':
                    field_type = FormFieldType.CHECKBOX
                else:
                    field_type = FormFieldType.TEXT

                fields.append(FormField(
                    name=name,
                    field_type=field_type,
                    label=placeholder,
                    required=required,
                ))
            except Exception:
                continue

        return fields

    async def apply(self, request: ApplicationRequest) -> ApplicationResult:
        """Apply to a job using generic form filling."""
        context = None
        screenshot_path = None
        screenshot_url = None

        try:
            context = await self.browser.new_context(cookies=request.session_cookies)
            page = await context.new_page()

            # Navigate to job URL
            await page.goto(request.job_url, wait_until='networkidle', timeout=30000)

            # Check for blockers
            blocker = await self.check_for_blockers(page)
            if blocker:
                if request.take_screenshot:
                    screenshot_path, screenshot_url = await self.browser.take_screenshot(page, "blocked")
                return ApplicationResult(
                    status=blocker,
                    job_url=request.job_url,
                    message=f"Application blocked: {blocker.value}",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                )

            # Try to find and click "Apply" button
            apply_buttons = [
                'button:has-text("Apply")',
                'a:has-text("Apply")',
                'button:has-text("Easy Apply")',
                '[data-control-name="jobdetails_topcard_inapply"]',
                '.jobs-apply-button',
            ]

            clicked_apply = False
            for selector in apply_buttons:
                try:
                    button = page.locator(selector).first
                    if await button.is_visible(timeout=2000):
                        await button.click()
                        clicked_apply = True
                        await page.wait_for_timeout(2000)  # Wait for form to load
                        break
                except Exception:
                    continue

            # Detect form fields
            fields = await self.detect_form_fields(page)

            # Fill common fields
            filled = await self.fill_common_fields(page, request.profile)

            # Upload resume if provided
            if request.resume_path:
                resume_uploaded = await self.upload_resume(page, request.resume_path)
                if resume_uploaded:
                    filled += 1

            # Take screenshot before submission
            if request.take_screenshot:
                screenshot_path, screenshot_url = await self.browser.take_screenshot(page, "application")

            # Check for required fields that couldn't be filled
            missing_fields = [f.name for f in fields if f.required and f.name not in str(request.profile.model_dump())]

            # If dry run, don't submit
            if request.dry_run:
                return ApplicationResult(
                    status=ApplicationStatus.DRAFT,
                    job_url=request.job_url,
                    message=f"Dry run completed. Filled {filled} fields.",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                    fields_filled=filled,
                    fields_missing=missing_fields,
                )

            # If there are missing required fields, return as draft
            if missing_fields:
                return ApplicationResult(
                    status=ApplicationStatus.DRAFT,
                    job_url=request.job_url,
                    message=f"Application saved as draft. Missing required fields: {missing_fields}",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                    fields_filled=filled,
                    fields_missing=missing_fields,
                )

            # Try to submit
            submit_selectors = [
                'button[type="submit"]',
                'button:has-text("Submit")',
                'input[type="submit"]',
                'button:has-text("Send Application")',
            ]

            submitted = False
            for selector in submit_selectors:
                try:
                    submit_button = page.locator(selector).first
                    if await submit_button.is_visible(timeout=2000):
                        await submit_button.click()
                        submitted = True
                        await page.wait_for_timeout(3000)  # Wait for submission
                        break
                except Exception:
                    continue

            if submitted:
                # Take final screenshot
                if request.take_screenshot:
                    screenshot_path, screenshot_url = await self.browser.take_screenshot(page, "submitted")

                return ApplicationResult(
                    status=ApplicationStatus.SUCCESS,
                    job_url=request.job_url,
                    message="Application submitted successfully",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                    fields_filled=filled,
                )
            else:
                return ApplicationResult(
                    status=ApplicationStatus.DRAFT,
                    job_url=request.job_url,
                    message="Could not find submit button. Application saved as draft.",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                    fields_filled=filled,
                )

        except asyncio.TimeoutError:
            return ApplicationResult(
                status=ApplicationStatus.TIMEOUT,
                job_url=request.job_url,
                message="Page load timeout",
            )
        except Exception as e:
            return ApplicationResult(
                status=ApplicationStatus.FAILED,
                job_url=request.job_url,
                message=f"Application failed: {str(e)}",
            )
        finally:
            if context:
                await context.close()


# Singleton browser manager
_browser_manager: Optional[BrowserManager] = None


def get_browser_manager() -> BrowserManager:
    """Get the browser manager singleton."""
    global _browser_manager
    if _browser_manager is None:
        _browser_manager = BrowserManager()
    return _browser_manager


async def shutdown_browser():
    """Shutdown the browser manager."""
    global _browser_manager
    if _browser_manager:
        await _browser_manager.stop()
        _browser_manager = None

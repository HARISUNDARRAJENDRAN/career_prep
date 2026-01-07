"""
Indeed Job Application Automation

Specialized applicator for Indeed job applications.
"""

import asyncio
from typing import Optional
from playwright.async_api import Page

from .base import (
    JobApplicator,
    BrowserManager,
    ApplicationRequest,
    ApplicationResult,
    ApplicationStatus,
    FormField,
    FormFieldType,
)


class IndeedApplicator(JobApplicator):
    """Indeed-specific job applicator."""

    INDEED_DOMAINS = ['indeed.com', 'www.indeed.com', 'indeed.co']

    async def detect_platform(self, page: Page) -> bool:
        """Check if the page is an Indeed job listing."""
        url = page.url.lower()
        return any(domain in url for domain in self.INDEED_DOMAINS)

    async def detect_form_fields(self, page: Page) -> list[FormField]:
        """Detect Indeed application form fields."""
        fields = []

        try:
            # Indeed uses various form structures
            field_containers = await page.locator('[data-testid*="field"], .ia-FormField').all()

            for container in field_containers:
                try:
                    # Get label
                    label_el = container.locator('label').first
                    label = await label_el.text_content() if await label_el.count() > 0 else ""

                    # Check for required
                    required = await container.locator('[aria-required="true"], .ia-RequiredBadge').count() > 0

                    # Determine field type
                    if await container.locator('input[type="file"]').count() > 0:
                        fields.append(FormField(
                            name="resume",
                            field_type=FormFieldType.FILE,
                            label=label.strip() if label else "Resume",
                            required=required,
                        ))
                    elif await container.locator('select').count() > 0:
                        fields.append(FormField(
                            name=label.strip() if label else "select_field",
                            field_type=FormFieldType.SELECT,
                            label=label.strip() if label else "",
                            required=required,
                        ))
                    elif await container.locator('input[type="radio"]').count() > 0:
                        fields.append(FormField(
                            name=label.strip() if label else "radio_field",
                            field_type=FormFieldType.RADIO,
                            label=label.strip() if label else "",
                            required=required,
                        ))
                    elif await container.locator('textarea').count() > 0:
                        fields.append(FormField(
                            name=label.strip() if label else "textarea_field",
                            field_type=FormFieldType.TEXTAREA,
                            label=label.strip() if label else "",
                            required=required,
                        ))
                    elif await container.locator('input').count() > 0:
                        fields.append(FormField(
                            name=label.strip() if label else "text_field",
                            field_type=FormFieldType.TEXT,
                            label=label.strip() if label else "",
                            required=required,
                        ))
                except Exception:
                    continue

        except Exception:
            pass

        return fields

    async def _is_logged_in(self, page: Page) -> bool:
        """Check if user is logged into Indeed."""
        try:
            # Check for profile indicators
            profile_indicators = [
                '[data-testid="account-menu"]',
                '.gnav-AccountMenu',
                '#gnav-profile-picture',
            ]
            for indicator in profile_indicators:
                if await page.locator(indicator).count() > 0:
                    return True

            # Check for sign-in redirect
            if '/account/login' in page.url or '/login' in page.url:
                return False

            return True
        except Exception:
            return False

    async def _click_apply_button(self, page: Page) -> bool:
        """Click the Apply button on Indeed."""
        apply_selectors = [
            '[data-testid="indeedApplyButton"]',
            'button:has-text("Apply now")',
            'button:has-text("Apply on company site")',
            '#indeedApplyButton',
            '.jobsearch-IndeedApplyButton-newDesign',
        ]

        for selector in apply_selectors:
            try:
                button = page.locator(selector).first
                if await button.is_visible(timeout=3000):
                    await button.click()
                    await page.wait_for_timeout(2000)
                    return True
            except Exception:
                continue

        return False

    async def _fill_indeed_form(self, page: Page, request: ApplicationRequest) -> tuple[int, list[str]]:
        """Fill Indeed application form fields. Returns (filled_count, missing_fields)."""
        filled = 0
        missing = []

        try:
            # Common Indeed field patterns
            field_mapping = {
                'first_name': ['firstName', 'first-name', 'givenName'],
                'last_name': ['lastName', 'last-name', 'familyName'],
                'email': ['email', 'emailAddress'],
                'phone': ['phone', 'phoneNumber', 'telephone'],
                'city': ['city', 'locality'],
                'state': ['state', 'region'],
            }

            for field, patterns in field_mapping.items():
                value = getattr(request.profile, field, None)
                if value:
                    for pattern in patterns:
                        try:
                            selectors = [
                                f'input[name*="{pattern}" i]',
                                f'input[id*="{pattern}" i]',
                                f'input[data-testid*="{pattern}" i]',
                            ]
                            for selector in selectors:
                                element = page.locator(selector).first
                                if await element.is_visible(timeout=500):
                                    await element.fill(str(value))
                                    filled += 1
                                    break
                        except Exception:
                            continue

            # Handle work experience questions
            experience_questions = await page.locator('[data-testid*="experience"], [id*="experience"]').all()
            for question in experience_questions:
                try:
                    if request.profile.years_experience:
                        input_el = question.locator('input, select').first
                        if await input_el.count() > 0:
                            await input_el.fill(str(request.profile.years_experience))
                            filled += 1
                except Exception:
                    continue

            # Upload resume
            if request.resume_path:
                try:
                    file_input = page.locator('input[type="file"]').first
                    if await file_input.count() > 0:
                        await file_input.set_input_files(request.resume_path)
                        filled += 1
                        await page.wait_for_timeout(2000)
                except Exception:
                    missing.append("resume_upload")

        except Exception as e:
            print(f"Error filling Indeed form: {e}")

        return filled, missing

    async def _navigate_indeed_steps(self, page: Page, request: ApplicationRequest) -> tuple[bool, str]:
        """Navigate through Indeed's multi-step application. Returns (success, message)."""
        max_steps = 15
        step = 0

        while step < max_steps:
            step += 1

            # Fill current page
            filled, _ = await self._fill_indeed_form(page, request)

            # Check for submit/continue buttons
            continue_button = page.locator(
                'button[data-testid*="continue"], '
                'button:has-text("Continue"), '
                'button:has-text("Next")'
            ).first

            submit_button = page.locator(
                'button[data-testid*="submit"], '
                'button:has-text("Submit your application"), '
                'button:has-text("Submit")'
            ).first

            # Try submit first
            if await submit_button.is_visible(timeout=1000):
                if request.dry_run:
                    return True, "Dry run completed - ready to submit"

                await submit_button.click()
                await page.wait_for_timeout(3000)

                # Check for success
                success_indicators = [
                    '[data-testid="application-success"]',
                    'text=Application submitted',
                    'text=Your application has been submitted',
                    '.ia-ApplicationSuccess',
                ]
                for indicator in success_indicators:
                    if await page.locator(indicator).count() > 0:
                        return True, "Application submitted successfully"

                return True, "Submit button clicked"

            # Try continue
            if await continue_button.is_visible(timeout=1000):
                await continue_button.click()
                await page.wait_for_timeout(1500)
                continue

            break

        return False, f"Could not complete application after {step} steps"

    async def apply(self, request: ApplicationRequest) -> ApplicationResult:
        """Apply to an Indeed job."""
        context = None
        screenshot_path = None
        screenshot_url = None

        try:
            context = await self.browser.new_context(cookies=request.session_cookies)
            page = await context.new_page()

            # Navigate to job URL
            await page.goto(request.job_url, wait_until='networkidle', timeout=30000)

            # Check if logged in (for Indeed Apply)
            logged_in = await self._is_logged_in(page)

            # Extract job details
            job_title = None
            company = None
            try:
                title_el = page.locator('[data-testid="jobsearch-JobInfoHeader-title"], .jobsearch-JobInfoHeader-title').first
                if await title_el.count() > 0:
                    job_title = await title_el.text_content()

                company_el = page.locator('[data-testid="inlineHeader-companyName"], [data-company-name]').first
                if await company_el.count() > 0:
                    company = await company_el.text_content()
            except Exception:
                pass

            # Click Apply button
            clicked = await self._click_apply_button(page)
            if not clicked:
                if request.take_screenshot:
                    screenshot_path, screenshot_url = await self.browser.take_screenshot(page, "no_apply_button")
                return ApplicationResult(
                    status=ApplicationStatus.DRAFT,
                    job_url=request.job_url,
                    job_title=job_title,
                    company=company,
                    message="Apply button not found",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                )

            # Wait for application form/page
            await page.wait_for_timeout(2000)

            # Check for external application (redirects to company site)
            if 'indeed.com' not in page.url.lower():
                if request.take_screenshot:
                    screenshot_path, screenshot_url = await self.browser.take_screenshot(page, "external_redirect")
                return ApplicationResult(
                    status=ApplicationStatus.DRAFT,
                    job_url=request.job_url,
                    job_title=job_title,
                    company=company,
                    message=f"External application site: {page.url}",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                )

            # Check for login requirement
            if not logged_in and '/account/login' in page.url:
                if request.take_screenshot:
                    screenshot_path, screenshot_url = await self.browser.take_screenshot(page, "login_required")
                return ApplicationResult(
                    status=ApplicationStatus.LOGIN_REQUIRED,
                    job_url=request.job_url,
                    job_title=job_title,
                    company=company,
                    message="Indeed login required. Please provide session cookies.",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                )

            # Check for blockers
            blocker = await self.check_for_blockers(page)
            if blocker:
                if request.take_screenshot:
                    screenshot_path, screenshot_url = await self.browser.take_screenshot(page, "blocked")
                return ApplicationResult(
                    status=blocker,
                    job_url=request.job_url,
                    job_title=job_title,
                    company=company,
                    message=f"Application blocked: {blocker.value}",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                )

            # Navigate through application steps
            success, message = await self._navigate_indeed_steps(page, request)

            # Take final screenshot
            if request.take_screenshot:
                screenshot_path, screenshot_url = await self.browser.take_screenshot(
                    page,
                    "submitted" if success else "incomplete"
                )

            return ApplicationResult(
                status=ApplicationStatus.SUCCESS if success and not request.dry_run else ApplicationStatus.DRAFT,
                job_url=request.job_url,
                job_title=job_title,
                company=company,
                message=message,
                screenshot_path=screenshot_path,
                screenshot_url=screenshot_url,
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

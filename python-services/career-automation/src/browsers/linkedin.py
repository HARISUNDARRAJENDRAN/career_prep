"""
LinkedIn Job Application Automation

Specialized applicator for LinkedIn Easy Apply and regular job applications.
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


class LinkedInApplicator(JobApplicator):
    """LinkedIn-specific job applicator with Easy Apply support."""

    LINKEDIN_DOMAINS = ['linkedin.com', 'www.linkedin.com']

    async def detect_platform(self, page: Page) -> bool:
        """Check if the page is a LinkedIn job listing."""
        url = page.url.lower()
        return any(domain in url for domain in self.LINKEDIN_DOMAINS)

    async def detect_form_fields(self, page: Page) -> list[FormField]:
        """Detect LinkedIn Easy Apply form fields."""
        fields = []

        try:
            # LinkedIn Easy Apply modal fields
            field_containers = await page.locator('.jobs-easy-apply-form-section__grouping').all()

            for container in field_containers:
                try:
                    # Get label
                    label_el = container.locator('label').first
                    label = await label_el.text_content() if await label_el.count() > 0 else ""

                    # Check for required indicator
                    required = '*' in label if label else False

                    # Determine field type
                    if await container.locator('input[type="file"]').count() > 0:
                        fields.append(FormField(
                            name="resume",
                            field_type=FormFieldType.FILE,
                            label=label.strip() if label else "Resume",
                            required=required,
                        ))
                    elif await container.locator('select').count() > 0:
                        options = await container.locator('select option').all_text_contents()
                        fields.append(FormField(
                            name=label.strip() if label else "select_field",
                            field_type=FormFieldType.SELECT,
                            label=label.strip() if label else "",
                            required=required,
                            options=options,
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
                        input_el = container.locator('input').first
                        input_type = await input_el.get_attribute('type') or 'text'
                        fields.append(FormField(
                            name=label.strip() if label else "text_field",
                            field_type=FormFieldType.TEXT if input_type == 'text' else FormFieldType.EMAIL if input_type == 'email' else FormFieldType.PHONE,
                            label=label.strip() if label else "",
                            required=required,
                        ))
                except Exception:
                    continue

        except Exception:
            pass

        return fields

    async def _is_logged_in(self, page: Page) -> bool:
        """Check if user is logged into LinkedIn."""
        try:
            # Check for profile nav or sign in button
            profile_nav = page.locator('.global-nav__me-photo, .nav-item__profile-member-photo')
            if await profile_nav.count() > 0:
                return True

            # Check URL for sign-in redirect
            if '/login' in page.url or '/authwall' in page.url:
                return False

            return True
        except Exception:
            return False

    async def _click_easy_apply(self, page: Page) -> bool:
        """Click the Easy Apply button."""
        easy_apply_selectors = [
            'button.jobs-apply-button',
            'button:has-text("Easy Apply")',
            '[data-control-name="jobdetails_topcard_inapply"]',
            '.jobs-apply-button--top-card',
        ]

        for selector in easy_apply_selectors:
            try:
                button = page.locator(selector).first
                if await button.is_visible(timeout=3000):
                    await button.click()
                    await page.wait_for_timeout(1500)
                    return True
            except Exception:
                continue

        return False

    async def _fill_easy_apply_form(self, page: Page, request: ApplicationRequest) -> tuple[int, list[str]]:
        """Fill the Easy Apply form. Returns (fields_filled, missing_fields)."""
        filled = 0
        missing = []

        try:
            # Wait for form to be visible
            await page.wait_for_selector('.jobs-easy-apply-content', timeout=5000)

            # Fill phone number if requested
            phone_input = page.locator('input[id*="phone"], input[name*="phone"]').first
            if await phone_input.is_visible(timeout=1000):
                await phone_input.fill(request.profile.phone)
                filled += 1

            # Handle work authorization questions
            work_auth_questions = await page.locator('.jobs-easy-apply-form-section__grouping').all()
            for question in work_auth_questions:
                try:
                    label = await question.locator('label').first.text_content()
                    label_lower = label.lower() if label else ""

                    # Work authorization
                    if 'authorized' in label_lower or 'legally' in label_lower:
                        yes_option = question.locator('input[value="Yes"], label:has-text("Yes")')
                        if await yes_option.count() > 0 and request.profile.authorized_to_work:
                            await yes_option.first.click()
                            filled += 1

                    # Sponsorship
                    elif 'sponsor' in label_lower or 'visa' in label_lower:
                        no_option = question.locator('input[value="No"], label:has-text("No")')
                        yes_option = question.locator('input[value="Yes"], label:has-text("Yes")')
                        if request.profile.requires_sponsorship and await yes_option.count() > 0:
                            await yes_option.first.click()
                            filled += 1
                        elif await no_option.count() > 0:
                            await no_option.first.click()
                            filled += 1

                    # Years of experience
                    elif 'years of experience' in label_lower or 'experience' in label_lower:
                        input_field = question.locator('input, select').first
                        if await input_field.count() > 0 and request.profile.years_experience:
                            await input_field.fill(str(request.profile.years_experience))
                            filled += 1

                except Exception:
                    continue

            # Upload resume if provided and field exists
            if request.resume_path:
                resume_uploaded = await self._upload_resume_linkedin(page, request.resume_path)
                if resume_uploaded:
                    filled += 1

        except Exception as e:
            print(f"Error filling form: {e}")

        return filled, missing

    async def _upload_resume_linkedin(self, page: Page, resume_path: str) -> bool:
        """Upload resume in LinkedIn Easy Apply."""
        try:
            # LinkedIn has specific resume upload handling
            upload_selectors = [
                'input[type="file"][name*="resume"]',
                'input[type="file"][aria-label*="resume"]',
                '.jobs-document-upload__upload-button input[type="file"]',
            ]

            for selector in upload_selectors:
                try:
                    file_input = page.locator(selector).first
                    if await file_input.count() > 0:
                        await file_input.set_input_files(resume_path)
                        await page.wait_for_timeout(2000)  # Wait for upload
                        return True
                except Exception:
                    continue

            return False
        except Exception:
            return False

    async def _navigate_easy_apply_steps(self, page: Page, request: ApplicationRequest) -> tuple[bool, str]:
        """Navigate through multi-step Easy Apply process. Returns (success, message)."""
        max_steps = 10
        step = 0

        while step < max_steps:
            step += 1

            # Fill current page fields
            await self._fill_easy_apply_form(page, request)

            # Take screenshot if dry run
            if request.dry_run and request.take_screenshot:
                await self.browser.take_screenshot(page, f"step_{step}")

            # Check for "Review" or "Submit" button (final step)
            submit_button = page.locator('button[aria-label*="Submit"], button:has-text("Submit application")').first
            if await submit_button.is_visible(timeout=1000):
                if request.dry_run:
                    return True, "Dry run completed - ready to submit"

                await submit_button.click()
                await page.wait_for_timeout(2000)

                # Check for success indicators
                success_indicators = [
                    '.jobs-apply-success',
                    'text=Application submitted',
                    'text=Your application was sent',
                ]
                for indicator in success_indicators:
                    if await page.locator(indicator).count() > 0:
                        return True, "Application submitted successfully"

                return True, "Submit button clicked"

            # Look for "Next" button
            next_button = page.locator('button[aria-label*="Continue"], button:has-text("Next"), button:has-text("Review")').first
            if await next_button.is_visible(timeout=1000):
                await next_button.click()
                await page.wait_for_timeout(1500)
                continue

            # No next or submit found
            break

        return False, f"Could not complete application after {step} steps"

    async def apply(self, request: ApplicationRequest) -> ApplicationResult:
        """Apply to a LinkedIn job."""
        context = None
        screenshot_path = None
        screenshot_url = None

        try:
            # Create browser context with LinkedIn cookies if provided
            cookies = request.session_cookies
            context = await self.browser.new_context(cookies=cookies)
            page = await context.new_page()

            # Navigate to job URL
            await page.goto(request.job_url, wait_until='networkidle', timeout=30000)

            # Check if logged in
            if not await self._is_logged_in(page):
                if request.take_screenshot:
                    screenshot_path, screenshot_url = await self.browser.take_screenshot(page, "login_required")
                return ApplicationResult(
                    status=ApplicationStatus.LOGIN_REQUIRED,
                    job_url=request.job_url,
                    message="LinkedIn login required. Please provide session cookies.",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                )

            # Extract job details
            job_title = None
            company = None
            try:
                title_el = page.locator('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title').first
                if await title_el.count() > 0:
                    job_title = await title_el.text_content()

                company_el = page.locator('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name').first
                if await company_el.count() > 0:
                    company = await company_el.text_content()
            except Exception:
                pass

            # Click Easy Apply button
            clicked = await self._click_easy_apply(page)
            if not clicked:
                if request.take_screenshot:
                    screenshot_path, screenshot_url = await self.browser.take_screenshot(page, "no_easy_apply")
                return ApplicationResult(
                    status=ApplicationStatus.DRAFT,
                    job_url=request.job_url,
                    job_title=job_title,
                    company=company,
                    message="Easy Apply button not found. Job may require external application.",
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                )

            # Check for captcha or other blockers
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

            # Navigate through Easy Apply steps
            success, message = await self._navigate_easy_apply_steps(page, request)

            # Take final screenshot
            if request.take_screenshot:
                screenshot_path, screenshot_url = await self.browser.take_screenshot(
                    page,
                    "submitted" if success else "incomplete"
                )

            if success:
                return ApplicationResult(
                    status=ApplicationStatus.SUCCESS if not request.dry_run else ApplicationStatus.DRAFT,
                    job_url=request.job_url,
                    job_title=job_title,
                    company=company,
                    message=message,
                    screenshot_path=screenshot_path,
                    screenshot_url=screenshot_url,
                )
            else:
                return ApplicationResult(
                    status=ApplicationStatus.DRAFT,
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

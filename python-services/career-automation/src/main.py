"""
Career Automation Service

Unified Python service for:
- Resume parsing (from existing resume-parser)
- Resume generation (LaTeX to PDF)
- Job application automation (Browser-based)
- Job scraping (via python-jobspy)
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, HTTPException, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import services
from services.resume_generator import (
    get_resume_generator,
    ResumeGenerationRequest,
    ResumeGenerationResponse,
    ResumeProfile,
)
from browsers import (
    get_browser_manager,
    shutdown_browser,
    ApplicationRequest,
    ApplicationResult,
    ApplicationStatus,
    UserProfile,
    GenericApplicator,
    LinkedInApplicator,
    IndeedApplicator,
)
from templates.templates import list_templates

# Load environment variables
load_dotenv(dotenv_path=Path(__file__).parent.parent.parent.parent / '.env')

# Create assets directory
ASSETS_DIR = Path(__file__).parent.parent / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    print("Career Automation Service starting...")
    yield
    # Shutdown
    print("Shutting down browser...")
    await shutdown_browser()
    print("Career Automation Service stopped.")


app = FastAPI(
    title="Career Automation Service",
    description="Unified service for resume generation, job applications, and career automation",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount assets directory for serving generated files
app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


# ============================================================================
# Health Check
# ============================================================================

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "career-automation",
        "version": "1.0.0",
    }


# ============================================================================
# Resume Parsing (from existing resume-parser)
# ============================================================================

# Re-import parsing functionality
import pymupdf
from docx import Document
from openai import OpenAI
import json


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF using PyMuPDF."""
    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        if doc.is_encrypted:
            doc.close()
            raise HTTPException(
                status_code=400,
                detail="Password-protected PDFs are not supported."
            )
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {str(e)}")


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX."""
    from io import BytesIO
    doc = Document(BytesIO(file_bytes))
    return "\n".join([para.text for para in doc.paragraphs])


async def parse_resume_with_ai(resume_text: str) -> dict:
    """Use OpenAI to extract structured data from resume."""
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    prompt = f"""Analyze this resume and extract:
1. Technical Skills (programming languages, frameworks, tools)
2. Soft Skills (leadership, communication, teamwork, etc.)
3. Projects (title and brief description)
4. Certifications
5. Spoken languages
6. Work Experience (title, company, dates, description)
7. Education (degree, institution, dates)

Resume:
{resume_text}

Return ONLY valid JSON with these keys:
{{
  "technical_skills": ["skill1", "skill2"],
  "soft_skills": ["skill1", "skill2"],
  "projects": [{{"title": "Project Name", "description": "Brief desc"}}],
  "certifications": ["cert1", "cert2"],
  "languages": ["English", "Spanish"],
  "experience": [{{"title": "Job Title", "company": "Company", "start_date": "2020", "end_date": "2023", "description": "..."}}],
  "education": [{{"degree": "BS Computer Science", "institution": "University", "graduation_date": "2020"}}]
}}"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a resume parsing assistant. Extract structured data from resumes and return ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
        temperature=0,
    )

    content = response.choices[0].message.content

    # Clean markdown code blocks
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]

    return json.loads(content.strip())


@app.post("/parse-resume")
async def parse_resume(file: UploadFile = File(...)):
    """Parse uploaded resume and return structured data."""
    if not file.filename.endswith(('.pdf', '.docx')):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

    file_bytes = await file.read()

    # Extract text
    if file.filename.endswith('.pdf'):
        resume_text = extract_text_from_pdf(file_bytes)
    else:
        resume_text = extract_text_from_docx(file_bytes)

    if not resume_text or len(resume_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract text from resume")

    # Parse with AI
    try:
        parsed_data = await parse_resume_with_ai(resume_text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")

    return {
        "raw_text": resume_text,
        "parsed_data": parsed_data,
        "filename": file.filename
    }


# ============================================================================
# Resume Generation
# ============================================================================

@app.get("/templates")
async def get_templates():
    """Get list of available resume templates."""
    templates = list_templates()
    return {
        "templates": templates,
        "default": "modern",
    }


@app.post("/generate-resume", response_model=ResumeGenerationResponse)
async def generate_resume(request: ResumeGenerationRequest):
    """
    Generate a PDF resume from profile data.

    Accepts a JSON profile with personal info, experience, education, skills, etc.
    Returns a URL to the generated PDF.
    """
    generator = get_resume_generator()
    result = generator.generate(request)

    if not result.success:
        raise HTTPException(status_code=500, detail=result.message)

    return result


@app.get("/resume/{file_id}")
async def get_resume_pdf(file_id: str):
    """Download a generated resume PDF."""
    generator = get_resume_generator()
    pdf_path = generator.get_pdf_path(file_id)

    if not pdf_path:
        raise HTTPException(status_code=404, detail="Resume not found")

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"resume_{file_id}.pdf"
    )


# ============================================================================
# Job Application Automation
# ============================================================================

class ApplyToJobRequest(BaseModel):
    """Request to apply to a job."""
    job_url: str
    profile: UserProfile
    resume_file_id: Optional[str] = None
    cover_letter: Optional[str] = None
    session_cookies: Optional[dict[str, str]] = None
    platform: Optional[str] = None  # linkedin, indeed, or auto-detect
    dry_run: bool = False
    take_screenshot: bool = True


@app.post("/apply")
async def apply_to_job(request: ApplyToJobRequest) -> ApplicationResult:
    """
    Apply to a job using browser automation.

    Supports:
    - LinkedIn Easy Apply
    - Indeed Apply
    - Generic job application forms

    Returns status, screenshot, and any error messages.
    """
    browser_manager = get_browser_manager()

    # Get resume path if file_id provided
    resume_path = None
    if request.resume_file_id:
        generator = get_resume_generator()
        resume_path = generator.get_pdf_path(request.resume_file_id)

    # Build application request
    app_request = ApplicationRequest(
        job_url=request.job_url,
        profile=request.profile,
        resume_path=resume_path,
        cover_letter=request.cover_letter,
        session_cookies=request.session_cookies,
        platform=request.platform,
        dry_run=request.dry_run,
        take_screenshot=request.take_screenshot,
    )

    # Select applicator based on platform or URL
    if request.platform == "linkedin" or "linkedin.com" in request.job_url.lower():
        applicator = LinkedInApplicator(browser_manager)
    elif request.platform == "indeed" or "indeed.com" in request.job_url.lower():
        applicator = IndeedApplicator(browser_manager)
    else:
        applicator = GenericApplicator(browser_manager)

    # Apply to job
    result = await applicator.apply(app_request)

    return result


class BatchApplyRequest(BaseModel):
    """Request to apply to multiple jobs."""
    job_urls: list[str]
    profile: UserProfile
    resume_file_id: Optional[str] = None
    cover_letter: Optional[str] = None
    session_cookies: Optional[dict[str, str]] = None
    dry_run: bool = False
    max_applications: int = 5
    delay_between_applications: int = 5  # seconds


class BatchApplyResponse(BaseModel):
    """Response from batch application."""
    total_jobs: int
    successful: int
    drafted: int
    failed: int
    results: list[ApplicationResult]


@app.post("/apply/batch")
async def batch_apply_to_jobs(
    request: BatchApplyRequest,
    background_tasks: BackgroundTasks
) -> BatchApplyResponse:
    """
    Apply to multiple jobs in sequence.

    Limited by max_applications to prevent rate limiting.
    Each application is spaced by delay_between_applications seconds.
    """
    import asyncio

    browser_manager = get_browser_manager()

    # Get resume path
    resume_path = None
    if request.resume_file_id:
        generator = get_resume_generator()
        resume_path = generator.get_pdf_path(request.resume_file_id)

    results: list[ApplicationResult] = []
    successful = 0
    drafted = 0
    failed = 0

    # Limit applications
    job_urls = request.job_urls[:request.max_applications]

    for i, job_url in enumerate(job_urls):
        # Build request for this job
        app_request = ApplicationRequest(
            job_url=job_url,
            profile=request.profile,
            resume_path=resume_path,
            cover_letter=request.cover_letter,
            session_cookies=request.session_cookies,
            dry_run=request.dry_run,
            take_screenshot=True,
        )

        # Select applicator
        if "linkedin.com" in job_url.lower():
            applicator = LinkedInApplicator(browser_manager)
        elif "indeed.com" in job_url.lower():
            applicator = IndeedApplicator(browser_manager)
        else:
            applicator = GenericApplicator(browser_manager)

        # Apply
        result = await applicator.apply(app_request)
        results.append(result)

        # Track stats
        if result.status == ApplicationStatus.SUCCESS:
            successful += 1
        elif result.status == ApplicationStatus.DRAFT:
            drafted += 1
        else:
            failed += 1

        # Delay between applications (except for last one)
        if i < len(job_urls) - 1:
            await asyncio.sleep(request.delay_between_applications)

    return BatchApplyResponse(
        total_jobs=len(job_urls),
        successful=successful,
        drafted=drafted,
        failed=failed,
        results=results,
    )


# ============================================================================
# Form Analysis (Pre-application check)
# ============================================================================

class FormAnalysisRequest(BaseModel):
    """Request to analyze a job application form."""
    job_url: str
    session_cookies: Optional[dict[str, str]] = None


class FormFieldInfo(BaseModel):
    """Information about a form field."""
    name: str
    field_type: str
    label: Optional[str] = None
    required: bool = False
    options: list[str] = Field(default_factory=list)


class FormAnalysisResponse(BaseModel):
    """Response from form analysis."""
    success: bool
    job_url: str
    company: Optional[str] = None
    job_title: Optional[str] = None
    platform: str  # linkedin, indeed, workday, greenhouse, lever, generic
    fields: list[FormFieldInfo]
    required_fields: list[str]
    missing_profile_fields: list[str]  # Fields we need that user hasn't provided
    blockers: list[str]  # Login required, captcha, etc.
    can_apply: bool
    estimated_fill_rate: int  # 0-100 percent of fields we can auto-fill
    screenshot_url: Optional[str] = None
    message: str


@app.post("/analyze-form")
async def analyze_job_form(request: FormAnalysisRequest) -> FormAnalysisResponse:
    """
    Analyze a job application form before applying.

    This pre-flight check:
    - Detects the platform (LinkedIn, Indeed, Workday, etc.)
    - Identifies all form fields and their types
    - Determines which fields can be auto-filled
    - Identifies blockers (login walls, captchas)
    - Provides an estimated fill rate
    """
    browser_manager = get_browser_manager()
    context = None
    screenshot_url = None

    try:
        context = await browser_manager.new_context(cookies=request.session_cookies)
        page = await context.new_page()

        # Navigate to job URL
        await page.goto(request.job_url, wait_until='networkidle', timeout=30000)

        # Detect platform
        url_lower = request.job_url.lower()
        platform = "generic"
        if "linkedin.com" in url_lower:
            platform = "linkedin"
        elif "indeed.com" in url_lower:
            platform = "indeed"
        elif "greenhouse.io" in url_lower or "boards.greenhouse.io" in url_lower:
            platform = "greenhouse"
        elif "lever.co" in url_lower or "jobs.lever.co" in url_lower:
            platform = "lever"
        elif "workday.com" in url_lower or "myworkday" in url_lower:
            platform = "workday"
        elif "smartrecruiters" in url_lower:
            platform = "smartrecruiters"

        # Extract job info
        job_title = None
        company = None

        try:
            # Try common selectors for job title
            title_selectors = [
                'h1.job-title', 'h1.topcard__title', '.jobs-unified-top-card h1',
                'h1[data-automation-id="jobPostingHeader"]', '.posting-headline h2'
            ]
            for selector in title_selectors:
                elem = page.locator(selector).first
                if await elem.count() > 0 and await elem.is_visible():
                    job_title = await elem.inner_text()
                    break

            # Try to get company name
            company_selectors = [
                '.company-name', '.topcard__org-name-link', '.jobs-unified-top-card__company-name',
                '[data-automation-id="companyName"]', '.posting-categories .company'
            ]
            for selector in company_selectors:
                elem = page.locator(selector).first
                if await elem.count() > 0 and await elem.is_visible():
                    company = await elem.inner_text()
                    break
        except Exception:
            pass

        # Check for blockers
        blockers = []
        content = await page.content()
        content_lower = content.lower()
        page_url = page.url.lower()

        login_indicators = ['sign in to apply', 'login to apply', 'sign in required', 'please log in', '/login', '/signin']
        for indicator in login_indicators:
            if indicator in content_lower or indicator in page_url:
                blockers.append("login_required")
                break

        captcha_indicators = ['captcha', 'recaptcha', 'hcaptcha', 'challenge-running', 'cf-turnstile']
        for indicator in captcha_indicators:
            if indicator in content_lower:
                blockers.append("captcha_detected")
                break

        # Click apply button if present
        apply_buttons = [
            'button:has-text("Apply")', 'a:has-text("Apply")',
            'button:has-text("Easy Apply")', '.jobs-apply-button'
        ]
        for selector in apply_buttons:
            try:
                button = page.locator(selector).first
                if await button.is_visible(timeout=2000):
                    await button.click()
                    await page.wait_for_timeout(2000)
                    break
            except Exception:
                continue

        # Detect form fields using GenericApplicator
        applicator = GenericApplicator(browser_manager)
        detected_fields = await applicator.detect_form_fields(page)

        # Convert to response format
        fields = [
            FormFieldInfo(
                name=f.name,
                field_type=f.field_type.value,
                label=f.label,
                required=f.required,
                options=f.options
            )
            for f in detected_fields
        ]

        # Identify required fields
        required_fields = [f.name for f in detected_fields if f.required]

        # Determine which profile fields we need that might be missing
        standard_profile_fields = {
            'first_name', 'last_name', 'email', 'phone',
            'city', 'state', 'country', 'linkedin_url', 'resume'
        }

        missing_profile_fields = []
        for field in detected_fields:
            if field.required:
                field_lower = field.name.lower()
                if 'phone' in field_lower and 'phone' not in str(standard_profile_fields):
                    missing_profile_fields.append('phone')
                if 'linkedin' in field_lower:
                    missing_profile_fields.append('linkedin_url')
                if any(x in field_lower for x in ['resume', 'cv', 'file']):
                    missing_profile_fields.append('resume_file')

        # Remove duplicates
        missing_profile_fields = list(set(missing_profile_fields))

        # Estimate fill rate (rough calculation)
        auto_fillable_patterns = [
            'first_name', 'last_name', 'email', 'phone', 'city', 'state',
            'country', 'linkedin', 'github', 'portfolio', 'current_title'
        ]

        fillable_count = 0
        for field in detected_fields:
            field_lower = field.name.lower()
            if any(pattern in field_lower for pattern in auto_fillable_patterns):
                fillable_count += 1

        total_required = len(required_fields) if required_fields else len(detected_fields)
        estimated_fill_rate = int((fillable_count / max(total_required, 1)) * 100) if total_required > 0 else 100
        estimated_fill_rate = min(100, estimated_fill_rate)

        # Take screenshot
        try:
            _, screenshot_url = await browser_manager.take_screenshot(page, "form_analysis")
        except Exception:
            pass

        # Determine if we can apply
        can_apply = len(blockers) == 0 and estimated_fill_rate >= 60

        message = f"Found {len(fields)} form fields on {platform} platform."
        if blockers:
            message = f"Blocked: {', '.join(blockers)}"
        elif estimated_fill_rate < 60:
            message = f"Low fill rate ({estimated_fill_rate}%). Review missing fields before applying."

        return FormAnalysisResponse(
            success=True,
            job_url=request.job_url,
            company=company,
            job_title=job_title,
            platform=platform,
            fields=fields,
            required_fields=required_fields,
            missing_profile_fields=missing_profile_fields,
            blockers=blockers,
            can_apply=can_apply,
            estimated_fill_rate=estimated_fill_rate,
            screenshot_url=screenshot_url,
            message=message,
        )

    except asyncio.TimeoutError:
        return FormAnalysisResponse(
            success=False,
            job_url=request.job_url,
            platform="unknown",
            fields=[],
            required_fields=[],
            missing_profile_fields=[],
            blockers=["timeout"],
            can_apply=False,
            estimated_fill_rate=0,
            message="Page load timeout",
        )
    except Exception as e:
        return FormAnalysisResponse(
            success=False,
            job_url=request.job_url,
            platform="unknown",
            fields=[],
            required_fields=[],
            missing_profile_fields=[],
            blockers=["error"],
            can_apply=False,
            estimated_fill_rate=0,
            message=f"Analysis failed: {str(e)}",
        )
    finally:
        if context:
            await context.close()


# ============================================================================
# Job Scraping (via python-jobspy)
# ============================================================================

class JobSearchRequest(BaseModel):
    """Request to search for jobs."""
    search_term: str
    location: Optional[str] = None
    distance: int = 50  # miles
    job_type: Optional[str] = None  # fulltime, parttime, internship, contract
    remote: bool = False
    results_wanted: int = 20
    hours_old: int = 72
    site_names: list[str] = Field(default_factory=lambda: ["indeed", "linkedin", "glassdoor"])


class JobResult(BaseModel):
    """A single job search result."""
    id: str
    title: str
    company: str
    location: Optional[str] = None
    job_url: str
    description: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    date_posted: Optional[str] = None
    job_type: Optional[str] = None
    is_remote: bool = False
    source: str


class JobSearchResponse(BaseModel):
    """Response from job search."""
    total_results: int
    jobs: list[JobResult]
    query: str


@app.post("/jobs/search")
async def search_jobs(request: JobSearchRequest) -> JobSearchResponse:
    """
    Search for jobs using python-jobspy.

    Scrapes multiple job boards (Indeed, LinkedIn, Glassdoor) and returns
    aggregated results.
    """
    try:
        from jobspy import scrape_jobs
        import pandas as pd

        # Scrape jobs
        jobs_df = scrape_jobs(
            site_name=request.site_names,
            search_term=request.search_term,
            location=request.location or "",
            distance=request.distance,
            is_remote=request.remote,
            job_type=request.job_type,
            results_wanted=request.results_wanted,
            hours_old=request.hours_old,
        )

        # Convert to list of JobResult
        jobs = []
        for _, row in jobs_df.iterrows():
            job = JobResult(
                id=str(row.get("id", "")),
                title=str(row.get("title", "")),
                company=str(row.get("company", "")),
                location=str(row.get("location", "")) if pd.notna(row.get("location")) else None,
                job_url=str(row.get("job_url", "")),
                description=str(row.get("description", ""))[:500] if pd.notna(row.get("description")) else None,
                salary_min=float(row.get("min_amount")) if pd.notna(row.get("min_amount")) else None,
                salary_max=float(row.get("max_amount")) if pd.notna(row.get("max_amount")) else None,
                date_posted=str(row.get("date_posted")) if pd.notna(row.get("date_posted")) else None,
                job_type=str(row.get("job_type")) if pd.notna(row.get("job_type")) else None,
                is_remote=bool(row.get("is_remote", False)),
                source=str(row.get("site", "")),
            )
            jobs.append(job)

        return JobSearchResponse(
            total_results=len(jobs),
            jobs=jobs,
            query=request.search_term,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Job search failed: {str(e)}")


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)

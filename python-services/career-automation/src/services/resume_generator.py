"""
Resume Generation Service

Handles the generation of PDF resumes from JSON profile data using LaTeX templates.
"""

import os
import subprocess
import tempfile
import uuid
import shutil
from pathlib import Path
from typing import Optional
from jinja2 import Environment, BaseLoader
from pydantic import BaseModel, Field

# Add parent directory to path for template imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from templates.templates import get_template, list_templates


class SkillsData(BaseModel):
    """Skills section of resume."""
    technical: list[str] = Field(default_factory=list)
    soft: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)


class ExperienceItem(BaseModel):
    """Single work experience entry."""
    title: str
    company: str
    location: Optional[str] = None
    start_date: str
    end_date: str = "Present"
    bullets: list[str] = Field(default_factory=list)


class EducationItem(BaseModel):
    """Single education entry."""
    institution: str
    degree: str
    field: Optional[str] = None
    graduation_date: str
    gpa: Optional[str] = None
    coursework: Optional[str] = None


class ProjectItem(BaseModel):
    """Single project entry."""
    name: str
    date: Optional[str] = None
    url: Optional[str] = None
    technologies: list[str] = Field(default_factory=list)
    bullets: list[str] = Field(default_factory=list)


class CertificationItem(BaseModel):
    """Single certification entry."""
    name: str
    issuer: str
    date: str


class AwardItem(BaseModel):
    """Single award entry."""
    name: str
    issuer: str
    date: str


class ResumeProfile(BaseModel):
    """Complete resume profile data."""
    # Required fields
    name: str
    email: str
    phone: str

    # Optional contact info
    location: Optional[str] = None
    linkedin: Optional[str] = None
    linkedin_username: Optional[str] = None
    github: Optional[str] = None
    github_username: Optional[str] = None
    portfolio: Optional[str] = None

    # Content sections
    summary: Optional[str] = None
    experience: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    skills: Optional[SkillsData] = None
    projects: list[ProjectItem] = Field(default_factory=list)
    certifications: list[CertificationItem] = Field(default_factory=list)
    awards: list[AwardItem] = Field(default_factory=list)


class ResumeGenerationRequest(BaseModel):
    """Request to generate a resume."""
    profile: ResumeProfile
    template: str = "modern"

    # Optional: tailor resume to a specific job
    job_title: Optional[str] = None
    job_description: Optional[str] = None
    job_company: Optional[str] = None


class ResumeGenerationResponse(BaseModel):
    """Response from resume generation."""
    success: bool
    pdf_path: Optional[str] = None
    pdf_url: Optional[str] = None
    file_id: str
    template_used: str
    message: str


def escape_latex(text: str) -> str:
    """Escape special LaTeX characters in text."""
    if not text:
        return text

    # Characters that need escaping in LaTeX
    special_chars = {
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
        '\\': r'\textbackslash{}',
    }

    for char, escaped in special_chars.items():
        text = text.replace(char, escaped)

    return text


def escape_profile_data(profile: ResumeProfile) -> dict:
    """Escape all text fields in profile data for LaTeX."""
    data = profile.model_dump()

    def escape_value(value):
        if isinstance(value, str):
            return escape_latex(value)
        elif isinstance(value, list):
            return [escape_value(item) for item in value]
        elif isinstance(value, dict):
            return {k: escape_value(v) for k, v in value.items()}
        return value

    return escape_value(data)


def render_latex_template(template_name: str, profile: ResumeProfile) -> str:
    """Render a LaTeX template with profile data."""
    template_content = get_template(template_name)

    # Create Jinja2 environment with custom delimiters to avoid LaTeX conflicts
    env = Environment(
        loader=BaseLoader(),
        variable_start_string='{{ ',
        variable_end_string=' }}',
        block_start_string='{%',
        block_end_string='%}',
        comment_start_string='{#',
        comment_end_string='#}',
    )

    template = env.from_string(template_content)

    # Escape profile data for LaTeX
    escaped_data = escape_profile_data(profile)

    # Render the template
    rendered = template.render(**escaped_data)

    return rendered


def compile_latex_to_pdf(latex_content: str, output_dir: str, filename: str) -> tuple[bool, str, Optional[str]]:
    """
    Compile LaTeX content to PDF using pdflatex.

    Returns:
        tuple: (success: bool, message: str, pdf_path: Optional[str])
    """
    tex_path = os.path.join(output_dir, f"{filename}.tex")
    pdf_path = os.path.join(output_dir, f"{filename}.pdf")

    # Write LaTeX content to file
    with open(tex_path, 'w', encoding='utf-8') as f:
        f.write(latex_content)

    try:
        # Run pdflatex twice for proper reference resolution
        for _ in range(2):
            result = subprocess.run(
                [
                    'pdflatex',
                    '-interaction=nonstopmode',
                    '-halt-on-error',
                    f'-output-directory={output_dir}',
                    tex_path
                ],
                capture_output=True,
                text=True,
                timeout=60  # 60 second timeout
            )

        # Check if PDF was generated
        if os.path.exists(pdf_path):
            # Clean up auxiliary files
            for ext in ['.aux', '.log', '.out']:
                aux_file = os.path.join(output_dir, f"{filename}{ext}")
                if os.path.exists(aux_file):
                    os.remove(aux_file)

            return True, "PDF generated successfully", pdf_path
        else:
            # PDF not generated, return error
            error_msg = result.stderr or result.stdout or "Unknown compilation error"
            return False, f"LaTeX compilation failed: {error_msg[:500]}", None

    except subprocess.TimeoutExpired:
        return False, "LaTeX compilation timed out", None
    except FileNotFoundError:
        return False, "pdflatex not found. Ensure texlive is installed.", None
    except Exception as e:
        return False, f"Compilation error: {str(e)}", None


class ResumeGenerator:
    """Service for generating PDF resumes from JSON profiles."""

    def __init__(self, assets_dir: str = "/app/assets"):
        self.assets_dir = Path(assets_dir)
        self.assets_dir.mkdir(parents=True, exist_ok=True)

    def generate(self, request: ResumeGenerationRequest) -> ResumeGenerationResponse:
        """
        Generate a PDF resume from profile data.

        Args:
            request: Resume generation request with profile and template

        Returns:
            ResumeGenerationResponse with PDF path or error message
        """
        file_id = str(uuid.uuid4())[:8]
        template_name = request.template.lower()

        # Validate template
        available_templates = list_templates()
        if template_name not in available_templates:
            return ResumeGenerationResponse(
                success=False,
                file_id=file_id,
                template_used=template_name,
                message=f"Template '{template_name}' not found. Available: {available_templates}"
            )

        try:
            # Render LaTeX template with profile data
            latex_content = render_latex_template(template_name, request.profile)

            # Create output directory for this resume
            output_dir = self.assets_dir / file_id
            output_dir.mkdir(parents=True, exist_ok=True)

            # Compile to PDF
            success, message, pdf_path = compile_latex_to_pdf(
                latex_content,
                str(output_dir),
                "resume"
            )

            if success and pdf_path:
                # Generate URL for the PDF
                pdf_url = f"/assets/{file_id}/resume.pdf"

                return ResumeGenerationResponse(
                    success=True,
                    pdf_path=pdf_path,
                    pdf_url=pdf_url,
                    file_id=file_id,
                    template_used=template_name,
                    message="Resume generated successfully"
                )
            else:
                return ResumeGenerationResponse(
                    success=False,
                    file_id=file_id,
                    template_used=template_name,
                    message=message
                )

        except Exception as e:
            return ResumeGenerationResponse(
                success=False,
                file_id=file_id,
                template_used=template_name,
                message=f"Generation failed: {str(e)}"
            )

    def get_pdf_path(self, file_id: str) -> Optional[str]:
        """Get the path to a generated PDF by file ID."""
        pdf_path = self.assets_dir / file_id / "resume.pdf"
        if pdf_path.exists():
            return str(pdf_path)
        return None

    def cleanup_old_files(self, max_age_hours: int = 24):
        """Remove generated files older than max_age_hours."""
        import time
        cutoff = time.time() - (max_age_hours * 3600)

        for item in self.assets_dir.iterdir():
            if item.is_dir():
                if item.stat().st_mtime < cutoff:
                    shutil.rmtree(item)


# Singleton instance
_generator: Optional[ResumeGenerator] = None


def get_resume_generator() -> ResumeGenerator:
    """Get the resume generator singleton."""
    global _generator
    if _generator is None:
        _generator = ResumeGenerator()
    return _generator

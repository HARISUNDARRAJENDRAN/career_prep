# Career Automation Service

Unified Python service for career automation, providing:

- **Resume Parsing**: Extract structured data from PDF/DOCX resumes
- **Resume Generation**: Generate professional PDF resumes from JSON using LaTeX templates
- **Job Application Automation**: Apply to jobs via browser automation (LinkedIn Easy Apply, Indeed, etc.)
- **Job Scraping**: Search jobs across multiple platforms using python-jobspy

## Quick Start

### Using Docker (Recommended)

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your_api_key

# Build and run
docker-compose up --build
```

The service will be available at `http://localhost:8002`.

### Local Development

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
```

2. Install dependencies:
```bash
pip install -r requirements.txt
playwright install chromium
```

3. Install LaTeX (required for PDF generation):
   - **Ubuntu/Debian**: `apt-get install texlive-latex-base texlive-fonts-recommended texlive-latex-extra`
   - **macOS**: `brew install basictex`
   - **Windows**: Install MiKTeX or TeX Live

4. Run the service:
```bash
cd src
python main.py
```

## API Endpoints

### Health Check
```
GET /health
```

### Resume Parsing
```
POST /parse-resume
Content-Type: multipart/form-data
file: <resume.pdf or resume.docx>
```

### Resume Generation
```
GET /templates
Returns list of available LaTeX templates

POST /generate-resume
{
  "profile": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1 555-123-4567",
    "location": "San Francisco, CA",
    "linkedin": "https://linkedin.com/in/johndoe",
    "github": "https://github.com/johndoe",
    "summary": "Experienced software engineer...",
    "experience": [
      {
        "title": "Senior Software Engineer",
        "company": "Tech Corp",
        "location": "San Francisco, CA",
        "start_date": "2021",
        "end_date": "Present",
        "bullets": [
          "Led development of microservices architecture",
          "Improved system performance by 40%"
        ]
      }
    ],
    "education": [
      {
        "institution": "Stanford University",
        "degree": "BS",
        "field": "Computer Science",
        "graduation_date": "2018",
        "gpa": "3.8"
      }
    ],
    "skills": {
      "technical": ["Python", "TypeScript", "React", "AWS"],
      "soft": ["Leadership", "Communication"],
      "languages": ["English", "Spanish"]
    },
    "projects": [],
    "certifications": []
  },
  "template": "modern"
}

GET /resume/{file_id}
Download generated PDF
```

### Job Application
```
POST /apply
{
  "job_url": "https://www.linkedin.com/jobs/view/123456",
  "profile": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "+1 555-123-4567",
    "city": "San Francisco",
    "state": "CA",
    "current_title": "Software Engineer",
    "years_experience": 5,
    "authorized_to_work": true,
    "requires_sponsorship": false
  },
  "resume_file_id": "abc123",  // From generate-resume response
  "session_cookies": {         // Optional: for authenticated applies
    "li_at": "cookie_value"
  },
  "dry_run": false,
  "take_screenshot": true
}

POST /apply/batch
Apply to multiple jobs in sequence
```

### Job Search
```
POST /jobs/search
{
  "search_term": "software engineer",
  "location": "San Francisco, CA",
  "distance": 50,
  "remote": true,
  "results_wanted": 20,
  "hours_old": 72,
  "site_names": ["indeed", "linkedin", "glassdoor"]
}
```

## Available Resume Templates

- **modern**: Clean, professional with blue accent color (sans-serif)
- **classic**: Traditional business style (serif, Times New Roman)
- **minimalist**: Ultra-clean, minimal decoration
- **deedy**: Popular two-column format

## Architecture

```
career-automation/
├── Dockerfile              # Docker build with LaTeX + Playwright
├── docker-compose.yml      # Easy local deployment
├── requirements.txt        # Python dependencies
├── templates/
│   ├── templates.py        # LaTeX resume templates
│   └── resume/             # Additional template files
├── src/
│   ├── main.py             # FastAPI application
│   ├── services/
│   │   └── resume_generator.py  # Resume PDF generation
│   └── browsers/
│       ├── base.py         # Browser automation base classes
│       ├── linkedin.py     # LinkedIn Easy Apply
│       └── indeed.py       # Indeed application
└── assets/                 # Generated files (PDFs, screenshots)
```

## Integration with Career Prep

This service is called by the Next.js Career Prep application:

1. **Resume Agent** calls `/generate-resume` to create tailored PDFs
2. **Action Agent** calls `/apply` to submit applications
3. **Sentinel Agent** calls `/jobs/search` for high-quality job scraping

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for resume parsing | Yes |

## Known Limitations

- LinkedIn Easy Apply requires valid session cookies (li_at)
- CAPTCHA-protected pages will return `captcha_blocked` status
- Some job sites block automated browsers
- LaTeX compilation requires texlive installation

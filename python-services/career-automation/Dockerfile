FROM python:3.11-slim

WORKDIR /app

# Install system dependencies: LaTeX for PDF generation, Playwright dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # LaTeX packages for resume PDF compilation
    texlive-latex-base \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-latex-extra \
    texlive-xetex \
    texlive-luatex \
    # PDF utilities
    ghostscript \
    poppler-utils \
    # Document conversion
    pandoc \
    # Playwright browser dependencies (manually specified to avoid install-deps issues)
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    # Additional Playwright dependencies
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    libxi6 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libglib2.0-0 \
    libgtk-3-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    # Fonts (replacement packages for deprecated ones)
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-unifont \
    # General utilities
    curl \
    wget \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python dependencies with extended timeout for large packages
# Split into groups to handle network issues better
COPY requirements.txt .

# Core packages first (smaller, faster)
RUN pip install --no-cache-dir --timeout=300 --retries=5 \
    fastapi==0.115.0 \
    uvicorn[standard]==0.32.0 \
    python-multipart==0.0.20 \
    python-dotenv==1.0.1 \
    Jinja2==3.1.4 \
    pydantic==2.10.3 \
    pylatexenc==2.10 \
    aiofiles==24.1.0 \
    httpx==0.28.1

# Larger packages separately
RUN pip install --no-cache-dir --timeout=300 --retries=5 \
    openai==1.57.0 \
    pandas==2.2.3 \
    Pillow==11.0.0

# Document processing
RUN pip install --no-cache-dir --timeout=300 --retries=5 \
    pymupdf==1.24.13 \
    python-docx==1.1.2 \
    pypandoc==1.15

# Browser automation and job scraping (largest packages)
RUN pip install --no-cache-dir --timeout=300 --retries=5 \
    playwright==1.49.0

RUN pip install --no-cache-dir --timeout=300 --retries=5 \
    python-jobspy==1.1.75

# Install Playwright browsers (Chromium only to save space)
# Note: Dependencies already installed above, no need for install-deps
RUN playwright install chromium

# Copy application code
COPY src/ ./src/
COPY templates/ ./templates/

# Create assets directory for generated files
RUN mkdir -p /app/assets

# Set working directory
WORKDIR /app/src

# Expose port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8002/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]

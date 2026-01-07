"""
LaTeX Resume Templates

This module contains LaTeX templates for resume generation.
Templates use Jinja2-style placeholders that get replaced with user data.
"""

# Modern Template - Clean, professional with accent color
MODERN_TEMPLATE = r"""
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{helvet}
\renewcommand{\familydefault}{\sfdefault}
\usepackage[margin=0.75in]{geometry}
\usepackage{hyperref}
\usepackage{xcolor}
\usepackage{enumitem}
\usepackage{titlesec}

% Define accent color
\definecolor{accent}{RGB}{0, 102, 204}

% Section formatting
\titleformat{\section}{\large\bfseries\color{accent}}{}{0em}{}[\titlerule]
\titlespacing*{\section}{0pt}{12pt}{6pt}

% Remove page numbers
\pagenumbering{gobble}

% Hyperlink setup
\hypersetup{
    colorlinks=true,
    linkcolor=accent,
    urlcolor=accent
}

\begin{document}

% Header
\begin{center}
    {\LARGE\bfseries {{ name }}}\\[4pt]
    {{ email }} \quad | \quad {{ phone }}{% if location %} \quad | \quad {{ location }}{% endif %}\\[2pt]
    {% if linkedin %}\href{{ '{' }}{{ linkedin }}{{ '}' }}{LinkedIn}{% endif %}
    {% if github %} \quad | \quad \href{{ '{' }}{{ github }}{{ '}' }}{GitHub}{% endif %}
    {% if portfolio %} \quad | \quad \href{{ '{' }}{{ portfolio }}{{ '}' }}{Portfolio}{% endif %}
\end{center}

{% if summary %}
\section{Summary}
{{ summary }}
{% endif %}

{% if experience %}
\section{Experience}
{% for job in experience %}
\textbf{{ '{' }}{{ job.title }}{{ '}' }} \hfill {{ job.start_date }} -- {{ job.end_date }}\\
\textit{{ '{' }}{{ job.company }}{{ '}' }}{% if job.location %}, {{ job.location }}{% endif %}
\begin{itemize}[leftmargin=20pt, topsep=2pt, itemsep=2pt]
{% for bullet in job.bullets %}
    \item {{ bullet }}
{% endfor %}
\end{itemize}
{% endfor %}
{% endif %}

{% if education %}
\section{Education}
{% for edu in education %}
\textbf{{ '{' }}{{ edu.degree }}{{ '}' }}{% if edu.field %} in {{ edu.field }}{% endif %} \hfill {{ edu.graduation_date }}\\
\textit{{ '{' }}{{ edu.institution }}{{ '}' }}{% if edu.gpa %} \quad GPA: {{ edu.gpa }}{% endif %}
{% if edu.coursework %}\\Relevant Coursework: {{ edu.coursework }}{% endif %}
{% endfor %}
{% endif %}

{% if skills %}
\section{Skills}
{% if skills.technical %}
\textbf{Technical:} {{ skills.technical | join(', ') }}\\
{% endif %}
{% if skills.soft %}
\textbf{Soft Skills:} {{ skills.soft | join(', ') }}
{% endif %}
{% if skills.languages %}
\\[2pt]\textbf{Languages:} {{ skills.languages | join(', ') }}
{% endif %}
{% endif %}

{% if projects %}
\section{Projects}
{% for project in projects %}
\textbf{{ '{' }}{{ project.name }}{{ '}' }}{% if project.url %} -- \href{{ '{' }}{{ project.url }}{{ '}' }}{Link}{% endif %} \hfill {{ project.date }}
\begin{itemize}[leftmargin=20pt, topsep=2pt, itemsep=2pt]
{% for bullet in project.bullets %}
    \item {{ bullet }}
{% endfor %}
\end{itemize}
{% endfor %}
{% endif %}

{% if certifications %}
\section{Certifications}
{% for cert in certifications %}
\textbf{{ '{' }}{{ cert.name }}{{ '}' }} -- {{ cert.issuer }} \hfill {{ cert.date }}\\
{% endfor %}
{% endif %}

\end{document}
"""

# Classic Template - Traditional, serif font, formal
CLASSIC_TEMPLATE = r"""
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{mathptmx}
\usepackage[margin=1in]{geometry}
\usepackage{hyperref}
\usepackage{enumitem}
\usepackage{titlesec}

% Section formatting
\titleformat{\section}{\normalsize\bfseries\MakeUppercase}{}{0em}{}
\titlespacing*{\section}{0pt}{12pt}{6pt}

% Remove page numbers
\pagenumbering{gobble}

% Hyperlink setup
\hypersetup{
    colorlinks=true,
    linkcolor=black,
    urlcolor=blue
}

\begin{document}

% Header
\begin{center}
    {\Large\textsc{{ '{' }}{{ name }}{{ '}' }}}\\[6pt]
    {{ email }} $\cdot$ {{ phone }}{% if location %} $\cdot$ {{ location }}{% endif %}\\
    {% if linkedin %}\href{{ '{' }}{{ linkedin }}{{ '}' }}{LinkedIn}{% endif %}
    {% if github %} $\cdot$ \href{{ '{' }}{{ github }}{{ '}' }}{GitHub}{% endif %}
    {% if portfolio %} $\cdot$ \href{{ '{' }}{{ portfolio }}{{ '}' }}{Portfolio}{% endif %}
\end{center}
\vspace{-8pt}
\hrule
\vspace{8pt}

{% if summary %}
\section{Professional Summary}
{{ summary }}
{% endif %}

{% if experience %}
\section{Professional Experience}
{% for job in experience %}
\textbf{{ '{' }}{{ job.company }}{{ '}' }} \hfill {{ job.location }}\\
\textit{{ '{' }}{{ job.title }}{{ '}' }} \hfill {{ job.start_date }} -- {{ job.end_date }}
\begin{itemize}[leftmargin=15pt, topsep=2pt, itemsep=1pt]
{% for bullet in job.bullets %}
    \item {{ bullet }}
{% endfor %}
\end{itemize}
{% endfor %}
{% endif %}

{% if education %}
\section{Education}
{% for edu in education %}
\textbf{{ '{' }}{{ edu.institution }}{{ '}' }} \hfill {{ edu.graduation_date }}\\
{{ edu.degree }}{% if edu.field %} in {{ edu.field }}{% endif %}{% if edu.gpa %}, GPA: {{ edu.gpa }}{% endif %}
{% if edu.coursework %}\\Relevant Coursework: {{ edu.coursework }}{% endif %}
{% endfor %}
{% endif %}

{% if skills %}
\section{Skills}
{% if skills.technical %}
\textbf{Technical Skills:} {{ skills.technical | join(', ') }}
{% endif %}
{% if skills.soft %}
\\\textbf{Professional Skills:} {{ skills.soft | join(', ') }}
{% endif %}
{% if skills.languages %}
\\\textbf{Languages:} {{ skills.languages | join(', ') }}
{% endif %}
{% endif %}

{% if projects %}
\section{Projects}
{% for project in projects %}
\textbf{{ '{' }}{{ project.name }}{{ '}' }} \hfill {{ project.date }}
{% if project.url %}(\href{{ '{' }}{{ project.url }}{{ '}' }}{Link}){% endif %}
\begin{itemize}[leftmargin=15pt, topsep=2pt, itemsep=1pt]
{% for bullet in project.bullets %}
    \item {{ bullet }}
{% endfor %}
\end{itemize}
{% endfor %}
{% endif %}

{% if certifications %}
\section{Certifications}
{% for cert in certifications %}
{{ cert.name }} -- {{ cert.issuer }} ({{ cert.date }})\\
{% endfor %}
{% endif %}

\end{document}
"""

# Minimalist Template - Clean, minimal, modern sans-serif
MINIMALIST_TEMPLATE = r"""
\documentclass[10pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{helvet}
\renewcommand{\familydefault}{\sfdefault}
\usepackage[margin=0.6in]{geometry}
\usepackage{hyperref}
\usepackage{xcolor}
\usepackage{enumitem}
\usepackage{titlesec}

% Define colors
\definecolor{darkgray}{RGB}{64, 64, 64}
\definecolor{lightgray}{RGB}{128, 128, 128}

% Section formatting
\titleformat{\section}{\normalsize\bfseries\color{darkgray}}{}{0em}{}
\titlespacing*{\section}{0pt}{10pt}{4pt}

% Remove page numbers
\pagenumbering{gobble}

% Hyperlink setup
\hypersetup{
    colorlinks=true,
    linkcolor=lightgray,
    urlcolor=lightgray
}

\begin{document}

% Header
{\huge\bfseries {{ name }}}\\[4pt]
{\small\color{lightgray}{{ email }} | {{ phone }}{% if location %} | {{ location }}{% endif %}
{% if linkedin %} | \href{{ '{' }}{{ linkedin }}{{ '}' }}{LinkedIn}{% endif %}
{% if github %} | \href{{ '{' }}{{ github }}{{ '}' }}{GitHub}{% endif %}}

{% if summary %}
\section{About}
{\small {{ summary }}}
{% endif %}

{% if experience %}
\section{Experience}
{% for job in experience %}
\textbf{{ '{' }}{{ job.title }}{{ '}' }} @ {{ job.company }} \hfill {\small\color{lightgray}{{ job.start_date }} -- {{ job.end_date }}}
\begin{itemize}[leftmargin=12pt, topsep=1pt, itemsep=1pt, parsep=0pt]
{% for bullet in job.bullets %}
    \item {\small {{ bullet }}}
{% endfor %}
\end{itemize}
{% endfor %}
{% endif %}

{% if education %}
\section{Education}
{% for edu in education %}
\textbf{{ '{' }}{{ edu.degree }}{{ '}' }}{% if edu.field %}, {{ edu.field }}{% endif %} \hfill {\small\color{lightgray}{{ edu.graduation_date }}}\\
{\small {{ edu.institution }}{% if edu.gpa %} | GPA: {{ edu.gpa }}{% endif %}}
{% endfor %}
{% endif %}

{% if skills %}
\section{Skills}
{% if skills.technical %}
{\small\textbf{Tech:} {{ skills.technical | join(' · ') }}}
{% endif %}
{% if skills.soft %}
\\{\small\textbf{Soft:} {{ skills.soft | join(' · ') }}}
{% endif %}
{% if skills.languages %}
\\{\small\textbf{Languages:} {{ skills.languages | join(' · ') }}}
{% endif %}
{% endif %}

{% if projects %}
\section{Projects}
{% for project in projects %}
\textbf{{ '{' }}{{ project.name }}{{ '}' }}{% if project.url %} {\small\href{{ '{' }}{{ project.url }}{{ '}' }}{[link]}}{% endif %} \hfill {\small\color{lightgray}{{ project.date }}}
\begin{itemize}[leftmargin=12pt, topsep=1pt, itemsep=1pt, parsep=0pt]
{% for bullet in project.bullets %}
    \item {\small {{ bullet }}}
{% endfor %}
\end{itemize}
{% endfor %}
{% endif %}

{% if certifications %}
\section{Certifications}
{% for cert in certifications %}
{\small {{ cert.name }} -- {{ cert.issuer }} ({{ cert.date }})}\\
{% endfor %}
{% endif %}

\end{document}
"""

# Deedy-style Template - Popular two-column resume format
DEEDY_TEMPLATE = r"""
\documentclass[10pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[margin=0.5in]{geometry}
\usepackage{hyperref}
\usepackage{xcolor}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{multicol}

% Define colors
\definecolor{primary}{RGB}{33, 37, 41}
\definecolor{accent}{RGB}{0, 123, 255}

% Section formatting
\titleformat{\section}{\large\bfseries\color{primary}\uppercase}{}{0em}{}[\titlerule]
\titlespacing*{\section}{0pt}{8pt}{4pt}

% Subsection formatting
\titleformat{\subsection}[runin]{\bfseries}{}{0em}{}

% Remove page numbers
\pagenumbering{gobble}

% Hyperlink setup
\hypersetup{
    colorlinks=true,
    linkcolor=accent,
    urlcolor=accent
}

% Custom commands
\newcommand{\resumeItem}[1]{\item\small{#1}}
\newcommand{\resumeSubheading}[4]{
    \textbf{#1} \hfill #2\\
    \textit{\small #3} \hfill \textit{\small #4}
}

\begin{document}

% Header
\begin{center}
    {\Huge\bfseries\color{primary} {{ name }}}\\[6pt]
    {\small
    {{ email }} | {{ phone }}{% if location %} | {{ location }}{% endif %}\\
    {% if linkedin %}\href{{ '{' }}{{ linkedin }}{{ '}' }}{linkedin.com/in/{{ linkedin_username }}}{% endif %}
    {% if github %} | \href{{ '{' }}{{ github }}{{ '}' }}{github.com/{{ github_username }}}{% endif %}
    {% if portfolio %} | \href{{ '{' }}{{ portfolio }}{{ '}' }}{Portfolio}{% endif %}
    }
\end{center}

{% if summary %}
\section{Summary}
\small {{ summary }}
{% endif %}

{% if experience %}
\section{Experience}
{% for job in experience %}
\resumeSubheading{{ '{' }}{{ job.title }}{{ '}' }}{{ '{' }}{{ job.start_date }} -- {{ job.end_date }}{{ '}' }}{{ '{' }}{{ job.company }}{{ '}' }}{{ '{' }}{{ job.location }}{{ '}' }}
\begin{itemize}[leftmargin=10pt, topsep=2pt, itemsep=1pt, parsep=0pt]
{% for bullet in job.bullets %}
    \resumeItem{{ '{' }}{{ bullet }}{{ '}' }}
{% endfor %}
\end{itemize}
\vspace{2pt}
{% endfor %}
{% endif %}

{% if education %}
\section{Education}
{% for edu in education %}
\resumeSubheading{{ '{' }}{{ edu.institution }}{{ '}' }}{{ '{' }}{{ edu.graduation_date }}{{ '}' }}{{ '{' }}{{ edu.degree }}{% if edu.field %} in {{ edu.field }}{% endif %}{{ '}' }}{{ '{' }}{% if edu.gpa %}GPA: {{ edu.gpa }}{% endif %}{{ '}' }}
{% if edu.coursework %}
\\\small{Coursework: {{ edu.coursework }}}
{% endif %}
{% endfor %}
{% endif %}

{% if skills %}
\section{Skills}
\begin{multicols}{2}
{% if skills.technical %}
\small\textbf{Technical:} {{ skills.technical | join(', ') }}
{% endif %}
\columnbreak
{% if skills.soft %}
\small\textbf{Soft Skills:} {{ skills.soft | join(', ') }}
{% endif %}
\end{multicols}
{% if skills.languages %}
\small\textbf{Languages:} {{ skills.languages | join(', ') }}
{% endif %}
{% endif %}

{% if projects %}
\section{Projects}
{% for project in projects %}
\textbf{{ '{' }}{{ project.name }}{{ '}' }}{% if project.technologies %} {\small | {{ project.technologies | join(', ') }}}{% endif %}{% if project.url %} | \href{{ '{' }}{{ project.url }}{{ '}' }}{\small Link}{% endif %} \hfill {\small {{ project.date }}}
\begin{itemize}[leftmargin=10pt, topsep=1pt, itemsep=1pt, parsep=0pt]
{% for bullet in project.bullets %}
    \resumeItem{{ '{' }}{{ bullet }}{{ '}' }}
{% endfor %}
\end{itemize}
{% endfor %}
{% endif %}

{% if certifications %}
\section{Certifications}
{% for cert in certifications %}
\small\textbf{{ '{' }}{{ cert.name }}{{ '}' }} -- {{ cert.issuer }} \hfill {{ cert.date }}\\
{% endfor %}
{% endif %}

{% if awards %}
\section{Awards \& Achievements}
{% for award in awards %}
\small\textbf{{ '{' }}{{ award.name }}{{ '}' }} -- {{ award.issuer }} \hfill {{ award.date }}\\
{% endfor %}
{% endif %}

\end{document}
"""

# Template registry
TEMPLATES = {
    "modern": MODERN_TEMPLATE,
    "classic": CLASSIC_TEMPLATE,
    "minimalist": MINIMALIST_TEMPLATE,
    "deedy": DEEDY_TEMPLATE,
}

def get_template(template_name: str) -> str:
    """Get a template by name, defaults to modern if not found."""
    return TEMPLATES.get(template_name.lower(), MODERN_TEMPLATE)

def list_templates() -> list[str]:
    """List all available template names."""
    return list(TEMPLATES.keys())

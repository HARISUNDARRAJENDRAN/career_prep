"""
Browser Automation Package

Provides browser-based job application automation for various platforms.
"""

from .base import (
    BrowserManager,
    JobApplicator,
    GenericApplicator,
    ApplicationRequest,
    ApplicationResult,
    ApplicationStatus,
    FormField,
    FormFieldType,
    UserProfile,
    get_browser_manager,
    shutdown_browser,
)
from .linkedin import LinkedInApplicator
from .indeed import IndeedApplicator


__all__ = [
    # Base classes
    "BrowserManager",
    "JobApplicator",
    "GenericApplicator",
    # Platform-specific
    "LinkedInApplicator",
    "IndeedApplicator",
    # Data models
    "ApplicationRequest",
    "ApplicationResult",
    "ApplicationStatus",
    "FormField",
    "FormFieldType",
    "UserProfile",
    # Utilities
    "get_browser_manager",
    "shutdown_browser",
]

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class ScanType(str, Enum):
    """Available security scan types."""
    KUBE_BENCH = "kube-bench"
    KYVERNO = "kyverno"
    TRIVY_IMAGE = "trivy-image"
    TRIVY_SBOM = "trivy-sbom"
    TRIVY_CLUSTER = "trivy-cluster"
    TRIVY_REPO = "trivy-repo"
    NMAP = "nmap"
    ALL = "all"

class ScanStatus(str, Enum):
    """Scan execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class ScanRequest(BaseModel):
    """Request to initiate a security scan."""
    scan_type: ScanType = Field(
        ...,
        description="Type of security scan to perform"
    )
    scan_id: Optional[str] = Field(
        None,
        description="Optional custom scan ID. If not provided, a UUID will be generated."
    )
    target: Optional[str] = Field(
        None,
        description="Scan target (e.g., image name for trivy-image scans)"
    )
    registry_user: Optional[str] = Field(
        None,
        description="Registry username (deprecated - use settings API instead)"
    )
    registry_password: Optional[str] = Field(
        None,
        description="Registry password (deprecated - use settings API instead)"
    )
    parameters: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Additional scan-specific parameters"
    )

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "scan_type": "trivy-image",
                    "target": "nginx:latest",
                    "parameters": {}
                },
                {
                    "scan_type": "kube-bench",
                    "parameters": {}
                },
                {
                    "scan_type": "all",
                    "parameters": {}
                }
            ]
        }

class ScanStartResponse(BaseModel):
    """Response when a scan is successfully initiated."""
    scan_id: str = Field(..., description="Unique identifier for tracking this scan")
    status: str = Field(..., description="Initial status (typically 'initiated')")

    class Config:
        json_schema_extra = {
            "example": {
                "scan_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "initiated"
            }
        }

class ScanResult(BaseModel):
    """Detailed scan execution result."""
    id: str = Field(..., description="Scan identifier")
    scan_type: ScanType = Field(..., description="Type of scan that was executed")
    status: ScanStatus = Field(..., description="Final execution status")
    timestamp: datetime = Field(..., description="Scan completion timestamp")
    details: Optional[Dict[str, Any]] = Field(None, description="Scan-specific result details")
    report_path: Optional[str] = Field(None, description="Path to detailed report file")

class ReportListItem(BaseModel):
    """Summary of a scan report."""
    id: str = Field(..., description="Report identifier")
    timestamp: str = Field(..., description="Report generation timestamp")
    scan_type: Optional[str] = Field(None, description="Type of scan")
    status: str = Field(..., description="Scan status")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "timestamp": "2026-01-07T10:30:00",
                "scan_type": "trivy-image",
                "status": "completed"
            }
        }

class RegistryCredential(BaseModel):
    """Container registry authentication credentials."""
    id: Optional[str] = Field(None, description="Registry credential ID")
    url: str = Field(..., description="Registry URL (e.g., docker.io, quay.io)")
    username: str = Field(..., description="Registry username")
    password: str = Field(..., description="Registry password (write-only in responses)")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "reg-001",
                "url": "quay.io",
                "username": "myuser",
                "password": "secret"
            }
        }

class RegistryDeleteResponse(BaseModel):
    """Response when a registry is deleted."""
    status: str = Field(..., description="Operation status")
    id: str = Field(..., description="ID of deleted registry")

    class Config:
        json_schema_extra = {
            "example": {
                "status": "deleted",
                "id": "reg-001"
            }
        }

class GitConfig(BaseModel):
    """Git repository scanning configuration."""
    username: str = Field(..., description="Git username")
    token: str = Field(..., description="Git personal access token (write-only in responses)")
    repos: str = Field(..., description="Newline-separated list of repository URLs to scan")

    class Config:
        json_schema_extra = {
            "example": {
                "username": "gituser",
                "token": "ghp_xxxxxxxxxxxx",
                "repos": "https://github.com/org/repo1\nhttps://github.com/org/repo2"
            }
        }

class FileListResponse(BaseModel):
    """Response containing list of files."""
    files: List[str] = Field(..., description="List of file paths")

    class Config:
        json_schema_extra = {
            "example": {
                "files": [
                    "report1.json",
                    "subdir/report2.json"
                ]
            }
        }

class ErrorResponse(BaseModel):
    """Standard error response."""
    detail: str = Field(..., description="Error message")

    class Config:
        json_schema_extra = {
            "example": {
                "detail": "Resource not found"
            }
        }



from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class ScanType(str, Enum):
    KUBE_BENCH = "kube-bench"
    KYVERNO = "kyverno"
    TRIVY_IMAGE = "trivy-image"
    TRIVY_SBOM = "trivy-sbom"
    TRIVY_CLUSTER = "trivy-cluster"
    TRIVY_REPO = "trivy-repo"
    NMAP = "nmap"
    ALL = "all"

class ScanStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class ScanRequest(BaseModel):
    scan_type: ScanType
    scan_id: Optional[str] = None  # Allow client to provide ID
    target: Optional[str] = None # e.g., image name for trivy
    registry_user: Optional[str] = None
    registry_password: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = {}

class ScanResult(BaseModel):
    id: str
    scan_type: ScanType
    status: ScanStatus
    timestamp: datetime
    details: Optional[Dict[str, Any]] = None
    report_path: Optional[str] = None

class RegistryCredential(BaseModel):
    id: Optional[str] = None
    url: str
    username: str
    password: str

class GitConfig(BaseModel):
    username: str
    token: str
    repos: str # multiline string or List[str]



from fastapi import APIRouter, HTTPException
from models import (RegistryCredential, GitConfig, RegistryDeleteResponse, ErrorResponse,
                     RegistryCredentialResponse, GitConfigResponse)
from typing import List
import json
import os
import uuid

router = APIRouter()
# Where runtime state is kept; point STATE_DIR at a persistent volume in Kubernetes.
STATE_DIR = os.getenv("STATE_DIR", ".")
os.makedirs(STATE_DIR, exist_ok=True)
REGISTRIES_FILE = os.path.join(STATE_DIR, "registries.json")

def load_registries():
    if not os.path.exists(REGISTRIES_FILE):
        return []
    try:
        with open(REGISTRIES_FILE, "r") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return []

def save_registries(registries):
    with open(REGISTRIES_FILE, "w") as f:
        json.dump(registries, f, indent=2)

@router.get(
    "/registries",
    response_model=List[RegistryCredentialResponse],
    summary="List Container Registries",
    description="""
    Retrieve all configured container registry credentials.

    These credentials are used for authenticating with private container registries
    when performing image scans with Trivy.

    ## Common Registry URLs

    * `docker.io` - Docker Hub
    * `quay.io` - Red Hat Quay
    * `gcr.io` - Google Container Registry
    * `ghcr.io` - GitHub Container Registry

    Credentials are automatically used when running `trivy-image` scans.
    """,
    responses={
        200: {
            "description": "List of configured registries",
            "model": List[RegistryCredential],
        }
    },
    tags=["settings"]
)
async def get_registries():
    """Get all configured container registry credentials."""
    registries = load_registries()
    # Return without passwords
    return [{"id": r.get("id"), "url": r.get("url"), "username": r.get("username")} for r in registries]

@router.post(
    "/registries",
    response_model=RegistryCredentialResponse,
    summary="Add Container Registry",
    description="""
    Add a new container registry credential.

    Use this endpoint to configure authentication for private container registries.
    The credentials will be securely stored and used automatically during image scans.

    ## Required Fields

    * `url` - Registry URL (e.g., quay.io, docker.io)
    * `username` - Registry username
    * `password` - Registry password or access token

    An ID will be automatically generated if not provided.
    """,
    responses={
        200: {
            "description": "Registry added successfully",
            "model": RegistryCredential,
        }
    },
    tags=["settings"]
)
async def add_registry(credential: RegistryCredential):
    """Add a new container registry credential."""
    registries = load_registries()
    if not credential.id:
        credential.id = str(uuid.uuid4())

    # Check for duplicates? For now, allow multiple.

    # Convert model to dict
    reg_dict = credential.dict()
    registries.append(reg_dict)
    save_registries(registries)
    # Return without password
    return {"id": credential.id, "url": credential.url, "username": credential.username}

@router.delete(
    "/registries/{reg_id}",
    response_model=RegistryDeleteResponse,
    summary="Delete Container Registry",
    description="""
    Remove a container registry credential by ID.

    After deletion, the credential will no longer be used for authentication
    during image scans.
    """,
    responses={
        200: {
            "description": "Registry deleted successfully",
            "model": RegistryDeleteResponse,
        },
        404: {
            "description": "Registry not found",
            "model": ErrorResponse,
        }
    },
    tags=["settings"]
)
async def delete_registry(reg_id: str):
    """Delete a registry credential by ID."""
    registries = load_registries()
    initial_len = len(registries)
    registries = [r for r in registries if r["id"] != reg_id]

    if len(registries) == initial_len:
        raise HTTPException(status_code=404, detail="Registry not found")

    save_registries(registries)
    return {"status": "deleted", "id": reg_id}

@router.put(
    "/registries/{reg_id}",
    response_model=RegistryCredentialResponse,
    summary="Update Container Registry",
    description="""
    Update an existing container registry credential.

    You can update the URL, username, and/or password. If the password field
    is empty, the existing password will be retained.

    This is useful for rotating credentials or fixing configuration errors.
    """,
    responses={
        200: {
            "description": "Registry updated successfully",
            "model": RegistryCredential,
        },
        404: {
            "description": "Registry not found",
            "model": ErrorResponse,
        }
    },
    tags=["settings"]
)
async def update_registry(reg_id: str, credential: RegistryCredential):
    """Update an existing registry credential."""
    registries = load_registries()

    # Find index
    index = next((i for i, r in enumerate(registries) if r["id"] == reg_id), -1)

    if index == -1:
        raise HTTPException(status_code=404, detail="Registry not found")

    # Update logic
    existing = registries[index]

    # Check if password is provided, otherwise keep existing
    new_password = credential.password
    if not new_password:
         new_password = existing.get("password", "")

    updated_registry = {
        "id": reg_id,
        "url": credential.url,
        "username": credential.username,
        "password": new_password
    }

    registries[index] = updated_registry
    save_registries(registries)

    # Return without password
    return {"id": reg_id, "url": credential.url, "username": credential.username}

GIT_CONFIG_FILE = os.path.join(STATE_DIR, "git_config.json")

def load_git_config():
    if not os.path.exists(GIT_CONFIG_FILE):
        return GitConfig(username="", token="", repos="")
    try:
        with open(GIT_CONFIG_FILE, "r") as f:
            data = json.load(f)
            return GitConfig(
                username=data.get("username", ""),
                token=data.get("token", ""),
                repos=data.get("repos", "")
            )
    except Exception:
        return GitConfig(username="", token="", repos="")

def save_git_config(config: GitConfig):
    data = {"username": config.username, "token": config.token, "repos": config.repos}
    with open(GIT_CONFIG_FILE, "w") as f:
        json.dump(data, f, indent=2)

@router.get(
    "/git-config",
    response_model=GitConfigResponse,
    summary="Get Git Configuration",
    description="""
    Retrieve the current Git repository scanning configuration.

    This configuration is used by the `trivy-repo` scan type to authenticate
    and clone repositories for vulnerability scanning.

    ## Returned Fields

    * `username` - Git username
    * `token` - Personal access token (masked in response)
    * `repos` - Newline-separated list of repository URLs

    If no configuration exists, default empty values are returned.
    """,
    responses={
        200: {
            "description": "Current Git configuration",
            "model": GitConfig,
        }
    },
    tags=["settings"]
)
async def get_git_config():
    """Get the current Git repository configuration."""
    config = load_git_config()
    # Return without token
    return {"username": config.username, "repos": config.repos}

@router.post(
    "/git-config",
    response_model=GitConfigResponse,
    summary="Update Git Configuration",
    description="""
    Update the Git repository scanning configuration.

    ## Required Fields

    * `username` - Git username or organization name
    * `token` - Personal access token with repo read permissions
    * `repos` - Newline-separated list of repository URLs to scan

    ## Token Permissions

    For GitHub, the token needs:
    - `repo` scope for private repositories
    - No special permissions for public repositories

    ## Repository Format

    Provide full HTTPS URLs, one per line:
    ```
    https://github.com/org/repo1
    https://github.com/org/repo2
    https://gitlab.com/group/project
    ```

    The configuration is persisted and used automatically when running `trivy-repo` scans.
    """,
    responses={
        200: {
            "description": "Git configuration updated successfully",
            "model": GitConfig,
        }
    },
    tags=["settings"]
)
async def update_git_config(config: GitConfig):
    """Update the Git repository scanning configuration."""
    save_git_config(config)
    # Return without token
    return {"username": config.username, "repos": config.repos}

from fastapi import APIRouter, HTTPException
from models import RegistryCredential, GitConfig
from typing import List
import json
import os
import uuid

router = APIRouter()
REGISTRIES_FILE = "registries.json"

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

@router.get("/registries", response_model=List[RegistryCredential])
async def get_registries():
    registries = load_registries()
    return registries

@router.post("/registries", response_model=RegistryCredential)
async def add_registry(credential: RegistryCredential):
    registries = load_registries()
    if not credential.id:
        credential.id = str(uuid.uuid4())
    
    # Check for duplicates? For now, allow multiple.
    
    # Convert model to dict
    reg_dict = credential.dict()
    registries.append(reg_dict)
    save_registries(registries)
    return credential

@router.delete("/registries/{reg_id}")
async def delete_registry(reg_id: str):
    registries = load_registries()
    initial_len = len(registries)
    registries = [r for r in registries if r["id"] != reg_id]
    
    if len(registries) == initial_len:
        raise HTTPException(status_code=404, detail="Registry not found")
        
    save_registries(registries)
    return {"status": "deleted", "id": reg_id}

@router.put("/registries/{reg_id}", response_model=RegistryCredential)
async def update_registry(reg_id: str, credential: RegistryCredential):
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
    
    return updated_registry

GIT_CONFIG_FILE = "git_config.json"

def load_git_config():
    if not os.path.exists(GIT_CONFIG_FILE):
        return GitConfig(username="", token="", repos="")
    try:
        with open(GIT_CONFIG_FILE, "r") as f:
            data = json.load(f)
            return GitConfig(**data)
    except json.JSONDecodeError:
        return GitConfig(username="", token="", repos="")

def save_git_config(config: GitConfig):
    with open(GIT_CONFIG_FILE, "w") as f:
        json.dump(config.dict(), f, indent=2)

@router.get("/git-config", response_model=GitConfig)
async def get_git_config():
    return load_git_config()

@router.post("/git-config", response_model=GitConfig)
async def update_git_config(config: GitConfig):
    save_git_config(config)
    return config

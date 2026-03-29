# GOVLAMBA SERVICES: SECURITY AUDIT ENVIRONMENT
**Version:** 1.0 (CTF Edition)  

---

## 1. RULES OF ENGAGEMENT (ROE)
You have been authorized to conduct a white-box security audit of the GovLamba Platform, a newly deployed, enterprise-grade microservices architecture handling citizen documentation, staff directories, and inter-departmental messaging. 

This repository is a self-contained, intentionally vulnerable local training environment. It contains vulnerabilities mapped to the **OWASP Top 10:2021**, simulating realistic "spaghetti architecture" flaws found in modern cloud-native applications.

**Scope of Audit:**
* The API Edge Gateway
* All underlying Node.js Microservices (Auth, Citizen, Document, Admin, Audit, etc.)
* Internal messaging streams and state manipulation

---

## 2. THE VALIDATION MECHANISM (HYBRID FLAGS)
This environment utilizes a **Hybrid Validation Model**. 

You will **not** find standard text flags (`FLAG{...}`) hardcoded in the application source code or hidden in static text files. 

Flags are generated dynamically. They will only appear in JSON responses or UI renders **after** you successfully execute an exploit that alters the application state or bypasses the intended business logic constraints. 

**Example:** *Successfully escalating your privileges via Mass Assignment will force the application to dynamically return the privilege-escalation flag within the updated session profile.*

---

## 3. BOOT SEQUENCE & INFRASTRUCTURE
To maximize accessibility, the heavy observability stack (Prometheus, OpenSearch, etc.) has been stripped out. The environment runs in a lightweight configuration suitable for local execution.

**Prerequisites:**
* Docker & Docker Compose
* Minimum 8GB RAM available

**Initialization:**
```bash
# Clone the repository
git clone [https://github.com/akintunero/lamba-govt.git](https://github.com/akintunero/lamba-govt.git)
cd lamba-govt

# Boot the lightweight target network
docker compose -f docker-compose.lite.yml up --build -d
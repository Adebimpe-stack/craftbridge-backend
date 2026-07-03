# CraftBridge Jobs Invitation System - Fix Summary

## Overview
Complete audit and fix of the invitation system to ensure proper token-based invitation flow, consistent module system, and improved email branding.

## Files Changed

### 1. models/TeamInvitation.js
**Changes:**
- Added `token` field (String, required, unique, indexed)
- Added crypto import for secure token generation
- Added pre-save hook to automatically generate secure token if not present
- Token is generated using `crypto.randomBytes(32).toString("hex")`

**Impact:** All new invitations will have a secure, unique token for invitation links.

### 2. services/emailService.js
**Changes:**
- Converted from ES modules (import/export) to CommonJS (require/module.exports)
- Updated `sendInvitationEmail` to accept `token` instead of `invitationId`
- Changed invitation link from `/accept-invitation/${invitationId}` to `/invite/${token}`
- Improved email subject: "You're invited to join ${companyName} on CraftBridge Jobs"
- Improved email content with proper CraftBridge Jobs branding
- Added support email: hire@craftbridgejobs.com
- Updated `sendVerificationEmail` subject to include "CraftBridge Jobs"

**Impact:** Consistent module system across codebase, secure token-based invitation links, improved branding.

### 3. routes/companies.js
**Changes:**
- Updated invitation creation to pass `invitation.token` to email service instead of `invitation._id`
- Updated resend invitation to pass `invitation.token` to email service
- Added new endpoint: `GET /companies/invite/:token` (public, no auth required)
  - Validates invitation token
  - Returns invitation details and whether user exists
  - Checks expiration and status
- Added new endpoint: `POST /companies/invite/:token/accept` (auth required)
  - Accepts invitation by token
  - Validates token, status, expiration
  - Joins user to company
  - Updates invitation status
- Kept legacy endpoint: `POST /companies/invitations/:id/accept` for backward compatibility

**Impact:** Secure token-based invitation flow, proper landing page for invitation links, both registered and unregistered users can handle invitations.

### 4. routes/auth.js
**Changes:**
- Added TeamInvitation model import
- Updated registration endpoint to accept optional `invitationToken` parameter
- When registering with invitation token:
  - Validates token exists, is pending, and not expired
  - Validates email matches invitation email
  - Sets user role to "employer"
  - Joins user to company immediately
  - Updates invitation status to "accepted"
  - Returns company info in response
- Updated login endpoint to:
  - Check for pending invitations for users without a company
  - Return pending invitations in login response
  - Include company and inviter details

**Impact:** Users can register via invitation link and automatically join company, users see pending invitations after login.

## Architecture Summary

### Invitation Flow

#### For Unregistered Users:
1. **Invite:** Company owner invites user via email
2. **Email:** User receives email with link: `https://craftbridgejobs.com/invite/{token}`
3. **Click Link:** Frontend calls `GET /companies/invite/:token`
4. **Check:** Backend returns invitation details and indicates user doesn't exist
5. **Register:** Frontend redirects to registration with invitation token
6. **Register with Token:** User registers with `invitationToken` in request body
7. **Auto-Join:** Backend validates token, creates user, joins company, accepts invitation
8. **Verify Email:** User verifies email address
9. **Complete:** User is now part of the company

#### For Registered Users:
1. **Invite:** Company owner invites user via email
2. **Email:** User receives email with link: `https://craftbridgejobs.com/invite/{token}`
3. **Click Link:** Frontend calls `GET /companies/invite/:token`
4. **Check:** Backend returns invitation details and indicates user exists
5. **Login:** Frontend redirects to login
6. **Login:** User logs in
7. **Pending Invitations:** Backend returns pending invitations in login response
8. **Accept:** User clicks accept, frontend calls `POST /companies/invite/:token/accept`
9. **Complete:** User joins company

### Database Schema

#### TeamInvitation Model:
```javascript
{
  company: ObjectId (ref: Company),
  email: String,
  role: String (enum: ["admin", "recruiter"]),
  invitedBy: ObjectId (ref: User),
  token: String (unique, indexed, auto-generated),
  status: String (enum: ["pending", "accepted", "rejected", "expired"]),
  expiresAt: Date,
  acceptedAt: Date,
  timestamps: true
}
```

### API Endpoints

#### Public (No Auth):
- `GET /companies/invite/:token` - Get invitation details by token

#### Authenticated:
- `POST /companies/:id/invite` - Create invitation (owner only)
- `POST /companies/:id/invitations/:invitationId/resend` - Resend invitation (owner only)
- `POST /companies/invite/:token/accept` - Accept invitation by token
- `POST /companies/invitations/:id/accept` - Accept invitation by ID (legacy)
- `GET /companies/invitations/pending` - Get user's pending invitations

#### Auth:
- `POST /auth/register` - Register (supports invitationToken parameter)
- `POST /auth/login` - Login (returns pending invitations)

## Email Branding

All emails now use:
- From: `"CraftBridge Jobs" <${process.env.ZEPTO_EMAIL}>`
- Subject includes "CraftBridge Jobs"
- Support email: hire@craftbridgejobs.com
- Consistent green color scheme (#166534)
- Professional, clean design

## Testing Steps

### 1. Test Invitation Creation
```bash
# Login as company owner
POST /auth/login
{
  "email": "owner@example.com",
  "password": "password"
}

# Create invitation
POST /companies/{companyId}/invite
Headers: Authorization: Bearer {token}
{
  "email": "newuser@example.com",
  "role": "admin"
}
```

### 2. Test Invitation Email
- Check email received
- Verify link format: `https://craftbridgejobs.com/invite/{token}`
- Verify branding and content

### 3. Test Unregistered User Flow
```bash
# Get invitation details
GET /companies/invite/{token}

# Register with invitation token
POST /auth/register
{
  "name": "New User",
  "email": "newuser@example.com",
  "password": "password",
  "invitationToken": "{token}"
}

# Verify response includes:
# - joinedCompany: true
# - companyId
# - companyRole
```

### 4. Test Registered User Flow
```bash
# Get invitation details
GET /companies/invite/{token}

# Login
POST /auth/login
{
  "email": "existinguser@example.com",
  "password": "password"
}

# Verify response includes pendingInvitations array

# Accept invitation
POST /companies/invite/{token}/accept
Headers: Authorization: Bearer {token}
```

### 5. Test Resend Invitation
```bash
POST /companies/{companyId}/invitations/{invitationId}/resend
Headers: Authorization: Bearer {token}
```

### 6. Test Expiration
- Create invitation
- Wait 7 days or manually set expiresAt to past
- Try to accept - should fail with "Invitation has expired"

## Security Improvements

1. **Secure Tokens:** Invitations now use cryptographically secure random tokens instead of predictable MongoDB IDs
2. **Token Validation:** All token-based endpoints validate token existence, status, and expiration
3. **Email Matching:** Registration with invitation validates email matches invitation email
4. **Expiration:** Invitations automatically expire after 7 days
5. **Status Tracking:** Invitations track status (pending, accepted, rejected, expired)

## Backward Compatibility

- Legacy endpoint `/companies/invitations/:id/accept` still works for existing implementations
- New token-based endpoints are preferred for security
- Existing invitations without tokens will need to be recreated or manually updated

## Migration Notes

If there are existing invitations in the database without tokens:
1. Existing invitations will not have tokens
2. They can still be accepted via the legacy `/invitations/:id/accept` endpoint
3. New invitations will automatically have tokens
4. To add tokens to existing invitations, run a migration script to generate tokens for all pending invitations

## Summary

The invitation system has been completely overhauled to:
- Use secure, unique tokens for invitation links
- Provide proper invitation landing experience
- Support both registered and unregistered users
- Automatically join users to companies when registering via invitation
- Show pending invitations after login
- Use consistent CommonJS module system
- Improve email branding with CraftBridge Jobs identity
- Maintain backward compatibility with legacy endpoints

All flows (invite, resend, register, login, accept) now work end-to-end with proper invitation context and security.

# University Maintenance Service Requests

A platform where students and staff report faults around campus, Maintenance Officers work on them, and Administrators oversee the process. It replaces phone calls, paper forms and WhatsApp messages.

## Service requests

**Service Request**:
A report raised by a User about a fault or maintenance need on campus, such as faulty electricity, damaged furniture or a leaking pipe.
_Avoid_: Complaint, ticket, issue

**Requester**:
The User who submitted a particular Service Request. A User of any Role can be a Requester.
_Avoid_: Reporter, complainant, customer

## People and access

**User**:
A person with an account in the system.
_Avoid_: Account, member

**Role**:
The set of permissions a User holds. Every User has exactly one Role: Student, Staff, Maintenance Officer or Administrator.

**Student**:
A Role for students of the university. It has the same permissions as Staff.

**Staff**:
A Role for university employees who raise Service Requests but don't work on them. Maintenance Officers and Administrators are employees too, but they hold their own Roles.
_Avoid_: Employee

**Maintenance Officer**:
A Role for the people who carry out the maintenance work on Service Requests.
_Avoid_: Technician, artisan, handyman

**Administrator**:
A Role for the people who manage Users, assign work and oversee every Service Request.
_Avoid_: Superuser

**Pending Sign-up**:
A person who has signed in for the first time but hasn't yet given their name and Role. They aren't a User until they finish, and they're removed if they don't finish within 7 days.
_Avoid_: Incomplete user, unverified user

**Sign-in Link**:
A single-use link emailed to a User that signs them in. Using one proves the User controls that email address.
_Avoid_: Magic link, login link

**Invitation**:
The email a new Maintenance Officer or Administrator receives after an Administrator creates their account.

**Deactivated User**:
A User an Administrator has suspended. They can't sign in until they're reactivated, and none of their information is removed.
_Avoid_: Suspended, disabled, banned

**Erased User**:
A User whose personal information has been permanently removed to meet data protection rules. Their record stays, so the Service Requests and history linked to it remain intact.
_Avoid_: Deleted user

**Activity Log**:
The permanent record of significant actions taken on Users, such as invitations, Role changes, deactivations and erasures. Each entry records who acted, on whom, and when.
_Avoid_: Audit trail, audit log

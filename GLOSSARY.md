# University Maintenance Service Requests

A platform where students and staff report faults around campus, Maintenance Officers work on them, and Administrators oversee the process. It replaces phone calls, paper forms and WhatsApp messages.

## Service requests

**Service Request**:
A report raised by a User about a fault or maintenance need on campus, such as faulty electricity, damaged furniture or a leaking pipe.
_Avoid_: Complaint, ticket, issue

**Requester**:
The User who submitted a particular Service Request. A User of any Role can be a Requester.
_Avoid_: Reporter, complainant, customer

**Reference**:
The identifier people quote for a Service Request, such as SR-PLUMB-42: the code of its Request Category when it was submitted, then that category's next number. It never changes.
_Avoid_: Ticket number, request ID

**Status**:
Where a Service Request is in its life: Submitted, Assigned, In Progress, Completed, Verified or Cancelled.

**Open**:
A Service Request that is Submitted, Assigned or In Progress, so the work on it hasn't finished.
_Avoid_: Active, pending

**Submitted**:
The Status of a Service Request waiting for an Administrator to give it an Assignment, whether it's new or has been handed back.
_Avoid_: Unassigned queue, new

**Completed**:
The Status of a Service Request whose Maintenance Officer says the work is done, until its Requester confirms the fault is fixed.
_Avoid_: Resolved, done, closed

**Verified**:
The final Status of a Completed Service Request whose Requester confirmed the fault is fixed, or didn't answer within 7 days.
_Avoid_: Closed, confirmed

**Cancelled**:
The final Status of a Service Request withdrawn before its work finished, by its Requester or an Administrator.
_Avoid_: Deleted, rejected

**Request Category**:
The type of fault a Service Request reports: Electrical, Plumbing, Furniture, Internet and network, Classroom equipment, or Other. Where the fault is belongs in the Service Request's location, not its Request Category.
_Avoid_: Fault type, request type

**Priority**:
How urgent an Administrator judges a Service Request to be: Low, Normal, High or Urgent. Every Service Request starts at Normal.
_Avoid_: Urgency, severity

**Assignment**:
An Administrator giving one Service Request to one Maintenance Officer to work on. A Service Request has at most one current Assignment; earlier ones stay on record.
_Avoid_: Job, task, work order

**Status Update**:
A change to a Service Request's status, recording who made it and when.
_Avoid_: Status change

**Progress Note**:
A note added to a Service Request that leaves its status unchanged, such as "Waiting for a replacement part".
_Avoid_: Comment, update

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
The permanent record of significant actions taken on Users and Service Requests, such as invitations, Role changes, deactivations, erasures, Assignments, Priority changes and Status Updates. Each entry records who acted, on which User or Service Request, and when.
_Avoid_: Audit trail, audit log

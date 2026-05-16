# 16 · Full Requirements (Verbatim — Canonical Source)

> This file is the **canonical, verbatim** statement of every requirement from the coursework rubric. If anything in `02_requirements_normalized.md`, `08_traceability_matrix.md`, or any other artifact appears to contradict this file, **THIS FILE WINS**. Every subagent must satisfy every applicable line here before reporting DONE. The Requirement Audit (M10) checks each item in `17_acceptance_checklist.md` against this file.

---

## Requirements for All Tasks (Task 1, 2, 3) and All Phases (Phase 1, 2, 3)

### Non-functional Requirements
- The application should have a user-friendly interface.
- The application should have a consistent interface across all users (student, staff, author, librarian).
- It should be responsive and functional across different devices (if you are developing a Web, Android, and iOS-based application system).
- Ensure that data is securely stored, particularly all user's credentials and book's information.

### Technical Requirements
- Use best coding practices, including readability and maintainability.
- Implement appropriate data structures for managing users and books.

### Submission Guidelines
- Submit your project as a ZIP file containing all source code and relevant documentation.
- Include a README file with setup instructions and any additional requirements that are useful for TA for grading purposes.
- Code should be well-commented to clarify functionality.

---

## Phase 1 — Main Features

### Task 1 · Student/Staff Portal

#### Task 1.1 Student/Staff Registration
- Create a user interface that allows students and staff to register for an account.
- Users must provide: Username (unique), Full Name, Password (with validation), Role (Student or Staff).
- Implement error handling for registration failures (duplicate username, weak password, etc.).
- Ensure that data is stored securely, particularly user credentials.
- Provide feedback for successful or failed register attempts.

#### Task 1.2 Student/Staff Login
- Implement a login screen where registered users can enter their credentials.
- Users must enter: Username, Password.
- Validate credentials against the registered user database.
- Provide feedback for successful or failed login attempts.

#### Task 1.3 Available Book Screen
- Create a screen displaying a list of available books (published by authors from Task 2).
- For each book show: Title, Author, Publish Date (date approved by librarian), Availability Status, Book Abstract/Summary.

#### Task 1.4 Borrow Book
- Using Task 1.3 screen, allow users to borrow a book.
- Check availability before allowing borrow.
- Update the book's status to reflect that it has been borrowed.
- Provide confirmation once a book is successfully borrowed.

### Task 2 · Author Portal

#### Task 2.1 Author Registration
- UI for author to register an account.
- Provide: Username (unique), Full Name, Password (validated), Bio (optional).
- Error handling for failures (duplicate username, weak password, etc.).
- Securely store credentials.
- Feedback for success/failure.

#### Task 2.2 Author Login
- Login screen for authors.
- Provide: Username, Password.
- Validate; feedback on success/failure.

#### Task 2.3 Publish New Book
- Form to publish new books.
- Provide: Title, Author Name (pre-filled with registered Full Name), Genre, Description (Abstract/Summary).
- Author must upload a book file (txt, pdf, word — PDF recommended).
- Validate book data and send publish request to librarian for approval.
- Confirmation upon successful submission.

### Task 3 · Librarian Portal

#### Task 3.1 Librarian Registration
- UI for librarian to register.
- Provide: Username (unique), Full Name, Password (validated), Employee ID (optional).
- Error handling; secure credential storage; success/failure feedback.

#### Task 3.2 Librarian Login
- Login screen for librarians.
- Provide: Username, Password.
- Validate; feedback on success/failure.

#### Task 3.3 Librarian New Books Approval Screen and Functionalities
- Screen lists new book submissions awaiting approval.
- For each submission show: Title, Author Username, Author Full Name, Genre, Submitted Date, Status (Pending Approval).
- Approve or reject submissions, **with a confirmation dialog before finalizing**.
- Update book status on approval/rejection and provide feedback.

---

## Phase 1 — Nice to have Features

### For Tasks 1.1, 2.1, 3.1 (Registration)
- Username: must be unique across all user types (student, staff, author, librarian). If not unique, show error.
- Full Name: check non-empty; show error if blank.
- Password: check strong/weak/empty; show error messages.
  - Use standard password limit and criteria (research online — apply industry standard).

### For Tasks 1.2, 2.2, 3.2 (Login)
- Check user belongs to this user type (e.g., a student should not log into a staff account since username is unique). Show appropriate error.

### For Task 1.3
- Reading Summary: allow user to read the book description before borrowing. If summary is too long, pop up a screen for quick read.
- Book Recommendations: suggest books based on borrowing history or popular titles (count times borrowed by all users, or use an LLM model). Other logical factors allowed.

### For Task 1.4
- Max/Min Duration: restrict borrow to max N days (e.g., 10–14) and check min time (not less than 0 seconds). Show appropriate error.
- Borrow Confirmation with Details: confirmation dialog displaying selected book(s), borrow duration, due date, and any applicable limits/warnings before finalizing.
- Book Availability: mark book titles red or black based on availability in search result; only allow borrowing available books.

### For Task 2.3
- Multiple Genre Selection: enable authors to select multiple genres from a predefined list.
- Auto-Save Draft: auto-save the publication form so authors can resume incomplete submissions later.

### For Task 3.3
- Search and Filter Submissions: search pending books by title/author/genre/submitted date; filter by status.
- Bulk Actions: select multiple pending submissions and approve/reject in bulk with confirmation.

---

## Phase 2 — Extended Features

**IMPORTANT**: Phase 2 is a direct extension of Phase 1. Integrate features into the current architecture; do not start a new application.

### Task 1 · Student/Staff Portal

#### Task 1.5 Borrowed Book Screen
- Screen displaying all books currently borrowed by the student/staff.
- Allow users to read the book in PDF format.
- Implement **bookmark** functionality (save reading progress).
- Add **text highlight** functionality to the PDF (highlight text for personal record).
- Return books, either:
  - Auto-return when borrowing period expires.
  - Self-return option before due date.
- Update book's availability on return.

#### Task 1.6 Manage Profile Screen
- Screen for students/staff to manage personal profile.
- Allow editing of Full Name, Password.
- Validation for updated credentials.
- Feedback for success/failure.

#### Task 1.7 Notification Board
- Notification board for students/staff. Display:
  - Book due reminders.
  - Send a book deletion notice only to users who borrowed that specific book.
  - Other important announcements (if any).
- Notifications: clear, timestamped, categorized.

### Task 2 · Author Portal

#### Task 2.4 Published Book Screen
- Screen displaying all books published or submitted by the author.
- Show: Title, Genre, Status (Approved/Rejected/Pending).
- Modify or edit book details.
- Delete books they have submitted.
- Validation and confirmation dialogs for edits and deletions.

#### Task 2.5 Manage Profile Screen
- Screen for author to manage profile.
- Allow editing of Full Name, Password, Bio.
- Validation; success/failure feedback.

#### Task 2.6 Notification Board
- Notification board for authors. Display:
  - Book approval/rejection updates.
  - Other important announcements.
- Clear, timestamped, categorized.

### Task 3 · Librarian Portal

#### Task 3.4 Manage All Users Screen
- Screen for librarian to manage all registered users (students, staff, authors, librarians).
- View, edit, or deactivate accounts.
- Validation and confirmation dialogs.

#### Task 3.5 Manage Own Profile Screen
- Screen for librarian to manage personal profile.
- Allow editing of Full Name, Password, Employee ID.
- Validation; success/failure feedback.

#### Task 3.6 Borrowed Books Record Screen
- Screen displaying a record of all borrowed books system-wide.
- Show: Book Title, Borrower Username, Borrow Date, Return Date, Status.
- Filtering and search functionality.

#### Task 3.7 Notification Board
- Notification board for librarians. Display:
  - New book submissions.
  - User account updates.
  - Other important announcements.
- Clear, timestamped, categorized.

---

## Phase 2 — Nice to have Features

### Whole System — Persistent Crash Recovery (Prof. Charles)
- Implemented across Student/Staff, Author, Librarian portals.
- Random Crash Simulation: system simulates random crashes during runtime to test resilience.
- Automatic Restoration: on reopen after crash, restore:
  - The exact screen the user was on.
  - The data and progress as it were before the crash.
  - Any temporary actions (highlights, drafts, notifications) that were not yet finalized.
- Validation & Feedback:
  - Confirmation message that system has restored last session successfully.
  - If restoration fails: clear error message and fall back to home screen.
- Implementation/Testing:
  - **Forced Application Exit**: close the application abruptly (kill the process or use Task Manager) while logged in. On reopen, verify last viewed screen + data are restored.
  - **Mock Crash Button**: implement a "Crash Test" button that simulates a crash. On reopening, the app reloads the last session.

### For Task 1.3
- Search and Filter Books: search by title, author; filter by genre, publish date, availability.
- Quick Review: quickly review book content before borrowing (show first few pages, or any reasonable approach).

### For Task 1.4
- Multiple Selections: select multiple books to borrow at once.
- Limit Borrow: logical limit on number of books a user can borrow at a time (e.g., 5 books max). Appropriate error message.

### For Task 2.3
- Book Cover Image Upload: optional cover image upload during publication. Validate format (JPG, PNG) and size limits.
- Book Preview: preview formatted summary of book details (title, genre, description) before final submission.

### For Task 3.3
- Book Content Review: preview or download the uploaded book file directly from the approval screen before deciding.
- Rejection Reason: require or allow librarians to enter a brief reason for rejection; store and optionally send as feedback to the author.

### For Task 1.5 (Borrowed Book Screen)
- Return Reminder Warnings: send reminders/warnings before due date even if user is not logged in.
- Auto-return Notifications: send notifications when book is auto-returned, even if user is not logged in.

### For Task 1.6 (Manage Profile)
- Profile Picture Upload (Optional): allow profile picture upload with format/size validation.
- Password Re-authentication: ask users to re-enter password if there are any changes to the profile.

### For Task 1.7 (Notification Board)
- Priority Notifications: highlight urgent notifications (auto-return books, book deletion by librarian) at the top.
- Archive Notifications: allow archiving old notifications.

### For Task 2.4 (Published Book Screen)
- Modify/Edit Book Details: allow editing **only if book is pending approval** (not published) OR not borrowed by any students/staff (if published).
- Bulk Delete: manage multiple books at once with confirmation dialogs.

### For Task 2.5 (Manage Profile)
- Password Strength Meter: real-time feedback when updating passwords.
- Auto logout from system: if password is changed, the system automatically logs out the current user.

### For Task 2.6 (Notification Board)
- Unread Notification Counter: display number of unread notifications.
- Search and Filter Notifications: filter by category (book acceptance, rejection, deletion, etc.).

### For Task 3.4 (Manage All Users)
- Role-Based Filters: filter users by role (student, staff, author, librarian).
- Add New User: librarian can add a new account of any type (student, staff, author, librarian).

### For Task 3.5 (Manage Own Profile)
- Profile Picture Upload (Optional): with format/size validation.
- Password Strength Meter: real-time feedback.

### For Task 3.6 (Borrowed Books Record)
- Advanced Filters: filter by overdue books, active borrowings, returned books.
- Export Records: export borrowed book records to CSV/Excel for reporting.

### For Task 3.7 (Notification Board)
- Priority Notifications: highlight urgent notifications (submission requests, user profile updates, special requests) at the top.
- Mark as Read & Delete Notifications: allow marking as read and deleting.

---

## Phase 3 — Advanced Features

**IMPORTANT**: Phase 3 is a direct extension of Phase 1 and Phase 2. Integrate features; do not start a new application.

### Task 1 · Student/Staff Portal

#### Task 1.8 Reading History
- Screen displaying reading history of each student/staff.
- Show: Book Title, Author, Borrow Date, Return Date, Reading Duration.
- Filtering and search (e.g., by date range, author, genre).
- History updated automatically when a book is borrowed and read.
- Keep track of reading progress.

#### Task 1.9 Review/Rate Books
- Students/staff can review and rate books they have borrowed.
- Allow written reviews and ratings (1–5 stars).
- Display average ratings and reviews on the available book's screen (to all users for all books).
- Keep record of reviews/ratings submitted for borrowed books.

#### Task 1.10 Request for a New Book
- Form for users to request new books.
- Provide: Title, Author, Genre, Reason for Request.
- Send request to librarian portal for review/approval.
- Confirmation feedback on submission.
- Notification to user once request is approved and book is uploaded by Librarian.

### Task 2 · Author Portal

#### Task 2.7 LLM Model to Generate Book Summary
- Integrate an LLM to auto-generate a book summary when author uploads a new book.
- Concise, accurate, relevant.
- Allow authors to edit or refine the generated summary before submission.
- Confirmation feedback once summary is finalized.

#### Task 2.8 View Stats Screen
- Screen displaying statistics for the author's published books.
- Metrics: number of reads, average ratings, reviews, borrow counts.
- Graphical representations (**bar charts and pie chart**) for visualization.

#### Task 2.9 Review and Feedback Handling
- Authors can view and respond to reviews/feedback on their books.
- Display all reviews/ratings submitted by students/staff.
- Authors can reply to feedback or flag inappropriate reviews.
- Send reply as notification to students/staff who submitted the feedback.

### Task 3 · Librarian Portal

#### Task 3.8 Manage Published Books Screen
- Screen for librarians to manage all published books.
- Modify book details published by any author.
- Add new books directly into the system.
- Require all necessary details: Title, Author Names, Genre, Description (**generate using LLM models**), File Upload, Cover Upload.
- Validation and confirmation dialogs.

#### Task 3.9 Manage New Book Requests and Download Requested Books
- Screen for librarians to manage book requests submitted by students/staff.
- Approve or reject requests.
- Implement tools (web crawler or ML-based tools) to download requested books if available online.
- If downloaded book has no summary/description, generate one using the LLM model.
- Confirmation feedback once request is processed.

---

## Phase 3 — Nice to have Features

### For Task 1.5 (Borrowed Book Screen)
- Partial Return Option: if multiple books borrowed, allow returning selected ones early (single or multiple).
- Closed Book Reading Screen: if user is reading a book when the borrowing period expires, automatically close the reading screen before auto-return.
- Search and Filter Books: search by title, author; filter by genre, publish date, availability.

### For Task 1.6 (Manage Profile)
- Password Re-authentication: re-enter password if any profile changes.
- Auto logout from system: on password change.

### For Task 1.7 (Notification Board)
- Unread Notification Counter.
- Search and Filter Notifications by category (due reminders, announcements, deletions, etc.).

### For Task 2.4 (Published Book Screen)
- Delete Books: allow delete only if pending approval OR not borrowed by any students/staff.
- Read Books: authors can read books they uploaded (both published and unpublished).

### For Task 2.5 (Manage Profile)
- Profile Picture Upload (Optional) with validation.
- Password Strength Meter (real-time).

### For Task 2.6 (Notification Board)
- Priority Notifications: highlight urgent (rejection feedback, deletion by librarian) at top.
- Archive Notifications.

### For Task 3.4 (Manage All Users)
- Activity Log: show recent activity (last login, no. of borrowed books).
- Bulk Account Actions: deactivate or update multiple accounts at once.
- Manage Librarians Account: librarians can manage other librarian accounts.

### For Task 3.5 (Manage Own Profile)
- Password Re-authentication on any profile changes.
- Auto logout on password change.

### For Task 3.6 (Borrowed Books Record)
- Overdue Highlighting: mark overdue books in red.

### For Task 3.7 (Notification Board)
- Archive Notifications.
- Search and Filter Notifications by type, date, urgency.

### For Task 1.8 (Reading History)
- Export History: export as PDF/CSV.
- Graphical Insights: charts showing reading trends (most read genres, average reading duration).
- Bookmark Integration: link reading history with bookmarks to show where the user left off.
- Achievements/Badges: award badges for milestones (e.g., "Read 10 books this semester").

### For Task 1.9 (Review/Rate Books)
- Anonymous Reviews Option.
- Review Sorting: by most recent or most helpful.

### For Task 1.10 (Request for a New Book)
- Request Tracking: track status (Pending, Approved, Rejected).
- Duplicate Request Detection: notify if same book already requested.
- Priority Requests: librarians can mark urgent requests (e.g., course-related books).
- Request History: log all requests submitted by the user.

### For Task 2.7 (LLM Book Summary)
- Multiple Summary Styles: short, medium, detailed.

### For Task 2.8 (View Stats Screen)
- Customizable Dashboard: choose which metrics to display.
- Download Reports: export in PDF/Excel.
- Trend Analysis: borrowing trends over time (weekly, monthly).

### For Task 2.9 (Review and Feedback Handling)
- Sentiment Analysis: AI classifies reviews as positive/neutral/negative.
- Reply Templates: quick reply templates for common responses.
- Feedback Analytics: aggregated statistics on review sentiment and ratings.

### For Task 3.8 (Manage Published Books)
- Bulk Edit/Delete: manage multiple books at once.
- Version History: log of changes made to book details.
- Advanced Filters: filter by genre, author, approval status.

### For Task 3.9 (Manage Book Requests)
- Request Prioritization: highlight based on urgency or popularity.
- Auto-Suggest Alternatives: if requested book unavailable, suggest similar titles.
- Notify the user: if similar title books from authors are downloaded, inform the user who made the request.
- Download Progress Indicator: progress bar when downloading.
- Request Analytics: stats on most requested genres/authors.
- Downloaded book stats: similar to author dashboard book stats — librarian can view stats for downloaded books only.

---

## Compliance Note for All Subagents

Before reporting DONE, **every subagent must search this file** (grep their feature area) and confirm each applicable line is implemented. If a feature is in this file and not in the subagent's deliverable, the report is REJECTED.

The final M10 Requirement Audit subagent walks `17_acceptance_checklist.md` and verifies each item against the running system. **The rebuild is not complete until the audit returns ALL GREEN.**

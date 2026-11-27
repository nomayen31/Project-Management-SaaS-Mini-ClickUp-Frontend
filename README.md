# Project-Management-SaaS-Mini-ClickUp-Frontend

Run `npm ci` and `npm run dev`. Open http://localhost:3000 with the Express backend running on port 4000. If the backend uses another origin, copy `.env.example` to `.env.local` and update `BACKEND_ORIGIN`.

The workspace overview reads the live health endpoint through the Next.js API rewrite. Run `npm run typecheck` and `npm run build` to verify the frontend.

Open `/auth` for the sign-in and account screens. Authentication requests go through the existing same-origin rewrite. Provider availability depends on the backend environment.

Open `/workspaces` to create or switch workspaces, manage members, and accept invite links.

Open `/projects` to browse projects in the selected workspace. Project details include the team, progress, and the task list. Open a task to view its people, checklist, and attachments.

Inside a project, switch between List, Board, and Calendar. On the board, drag a card by its handle or use its column selector and reorder buttons. The calendar shows tasks by their start and due dates.

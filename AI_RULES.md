# AI Development Rules for VoiceForge AI

This document outlines the core technologies and specific usage rules for maintaining consistency and quality in the VoiceForge AI application.

## 1. Tech Stack Overview

*   **Framework:** React (SPA)
*   **Language:** TypeScript
*   **Build Tool:** Vite
*   **Styling:** Tailwind CSS
*   **UI Library:** shadcn/ui (built on Radix UI)
*   **Routing:** React Router DOM
*   **Backend/Database/Auth:** Supabase
*   **Data Management:** TanStack Query (for server state)
*   **Icons:** Lucide React
*   **Forms:** React Hook Form and Zod

## 2. Library Usage Guidelines

| Feature | Recommended Library/Tool | Specific Rules |
| :--- | :--- | :--- |
| **UI Components** | `shadcn/ui` | Always use pre-existing shadcn components. If a component is missing, create a new, small component file in `src/components/`. |
| **Styling** | Tailwind CSS | Use utility classes exclusively. Ensure designs are responsive by default. |
| **Routing** | `react-router-dom` | All routes must be defined in `src/App.tsx`. Use the `NavLink` component from `src/components/NavLink.tsx` for navigation links. |
| **Backend/DB/Auth** | Supabase (`@/integrations/supabase/client`) | Use the pre-configured `supabase` client for all interactions (authentication, database queries). |
| **Data Fetching** | `@tanstack/react-query` | Use React Query for managing asynchronous data fetching, caching, and synchronization with the server. |
| **Icons** | `lucide-react` | Use Lucide icons for all visual elements. |
| **Forms & Validation** | `react-hook-form` & `zod` | Use React Hook Form for form state management and Zod for schema validation. |
| **Notifications** | `sonner` (General) & `useToast` (Critical) | Use `sonner` (imported as `Sonner` in `App.tsx`) for general, non-blocking notifications. Use the `useToast` hook (shadcn/ui) for critical errors or success messages related to user actions (e.g., form submission errors). |
| **File Structure** | Standardized | Components go in `src/components/`, pages in `src/pages/`, and hooks in `src/hooks/`. |
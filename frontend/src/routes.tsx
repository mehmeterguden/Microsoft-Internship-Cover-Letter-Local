import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/common/AppShell";
import { RouteError } from "@/components/common/RouteError";
import { Home } from "@/pages/Home";
import { Onboarding } from "@/pages/Onboarding";
import { Profile } from "@/pages/Profile";
import { ProfileComplete } from "@/pages/ProfileComplete";
import { Github } from "@/pages/Github";
import { LinkedIn } from "@/pages/LinkedIn";
import { Voice } from "@/pages/Voice";
import { Research } from "@/pages/Research";
import { Write } from "@/pages/Write";
import { CoverLetters } from "@/pages/CoverLetters";
import { ResponsibleAI } from "@/pages/ResponsibleAI";
import { Settings } from "@/pages/Settings";
import { ComponentsShowcase } from "@/pages/ComponentsShowcase";
import { NotFound } from "@/pages/NotFound";

export const router = createBrowserRouter([
  { path: "/", element: <Home />, errorElement: <RouteError /> },
  // Full-screen first-run wizard — lives outside the app shell (no sidebar).
  { path: "/onboarding", element: <Onboarding />, errorElement: <RouteError /> },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: "profile", element: <Profile /> },
      { path: "profile/complete", element: <ProfileComplete /> },
      { path: "github", element: <Github /> },
      { path: "linkedin", element: <LinkedIn /> },
      { path: "voice", element: <Voice /> },
      { path: "research", element: <Research /> },
      { path: "write", element: <Write /> },
      { path: "cover-letters", element: <CoverLetters /> },
      { path: "responsible-ai", element: <ResponsibleAI /> },
      { path: "settings", element: <Settings /> },
      { path: "dev/components", element: <ComponentsShowcase /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/common/AppShell";
import { RouteError } from "@/components/common/RouteError";
import { Home } from "@/pages/Home";
import { Onboarding } from "@/pages/Onboarding";
import { Profile } from "@/pages/Profile";
import { Github } from "@/pages/Github";
import { LinkedIn } from "@/pages/LinkedIn";
import { Voice } from "@/pages/Voice";
import { Research } from "@/pages/Research";
import { Write } from "@/pages/Write";
import { CoverLetters } from "@/pages/CoverLetters";
import { Settings } from "@/pages/Settings";
import { NotFound } from "@/pages/NotFound";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: "write", element: <Write /> },
      { path: "write/:jobId", element: <Write /> },
      { path: "research", element: <Research /> },
      { path: "research/:companySlug", element: <Research /> },
      { path: "cover-letters", element: <CoverLetters /> },
      { path: "cover-letters/:jobId", element: <CoverLetters /> },
      { path: "profile", element: <Profile /> },
      { path: "onboarding", element: <Onboarding /> },
      { path: "voice", element: <Voice /> },
      { path: "github", element: <Github /> },
      { path: "linkedin", element: <LinkedIn /> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

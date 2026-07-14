import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/common/AppShell";
import { RouteError } from "@/components/common/RouteError";
import { Home } from "@/pages/Home";
import { Onboarding } from "@/pages/Onboarding";
import { Profile } from "@/pages/Profile";
import { ProfileComplete } from "@/pages/ProfileComplete";
import { Github } from "@/pages/Github";
import { Voice } from "@/pages/Voice";
import { Research } from "@/pages/Research";
import { Write } from "@/pages/Write";
import { CoverLetters } from "@/pages/CoverLetters";
import { Settings } from "@/pages/Settings";
import { ComponentsShowcase } from "@/pages/ComponentsShowcase";
import { NotFound } from "@/pages/NotFound";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: "write", element: <Write /> },
      { path: "research", element: <Research /> },
      { path: "cover-letters", element: <CoverLetters /> },
      { path: "profile", element: <Profile /> },
      { path: "profile/complete", element: <ProfileComplete /> },
      { path: "onboarding", element: <Onboarding /> },
      { path: "voice", element: <Voice /> },
      { path: "github", element: <Github /> },
      { path: "settings", element: <Settings /> },
      { path: "dev/components", element: <ComponentsShowcase /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

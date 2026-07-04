import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/common/AppShell";
import { Home } from "@/pages/Home";
import { Onboarding } from "@/pages/Onboarding";
import { Profile } from "@/pages/Profile";
import { Github } from "@/pages/Github";
import { Voice } from "@/pages/Voice";
import { Research } from "@/pages/Research";
import { Write } from "@/pages/Write";
import { Applications } from "@/pages/Applications";
import { Settings } from "@/pages/Settings";
import { ComponentsShowcase } from "@/pages/ComponentsShowcase";
import { NotFound } from "@/pages/NotFound";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: "onboarding", element: <Onboarding /> },
      { path: "profile", element: <Profile /> },
      { path: "github", element: <Github /> },
      { path: "voice", element: <Voice /> },
      { path: "research", element: <Research /> },
      { path: "write", element: <Write /> },
      { path: "applications", element: <Applications /> },
      { path: "settings", element: <Settings /> },
      { path: "dev/components", element: <ComponentsShowcase /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

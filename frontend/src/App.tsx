import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/common/Toaster";
import { router } from "@/routes";

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
      <Toaster />
    </ThemeProvider>
  );
}

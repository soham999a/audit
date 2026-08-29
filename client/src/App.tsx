import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";

// Paper Protocol: the app shell keeps the methodology visible through the left rail and gives the audit a document-like workspace.
export default function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Home />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

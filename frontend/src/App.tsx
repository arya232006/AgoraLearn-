
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ChatApp from "./ChatApp";
import LandingPage from "./LandingPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/chat" element={<ChatApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

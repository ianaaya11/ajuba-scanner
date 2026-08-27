import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Library from './ui/Library';
import DocEditor from './ui/DocEditor';
import PageEditor from './ui/PageEditor';
import Scan from './ui/Scan';

export default function App() {
  // Hash routing keeps deep links working from the Android WebView's file:// origin.
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/doc/:id" element={<DocEditor />} />
        <Route path="/doc/:id/scan" element={<Scan />} />
        <Route path="/doc/:id/page/:pageId" element={<PageEditor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

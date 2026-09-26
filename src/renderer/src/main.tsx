import React from 'react';
import ReactDOM from 'react-dom/client';
import { EditorWindow } from './components/editor/EditorWindow';
import { App } from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {location.hash.startsWith('#editor?') ? <EditorWindow /> : <App />}
  </React.StrictMode>,
);

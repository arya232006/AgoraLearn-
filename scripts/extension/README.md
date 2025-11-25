# AgoraLearn Chrome Extension

This extension lets you ask questions about the current web page using AgoraLearn's AI backend. It extracts visible text from the page and provides a chat popup for Q&A.

## Features
- Extracts visible text from any page
- Chat popup UI (React)
- Sends questions and page context to AgoraLearn backend

## Usage
1. Load the extension in Chrome (see below)
2. Click the extension icon to open the chat popup
3. Ask questions about the current page

## Development
- Built with Manifest V3, React
- Content script extracts page text
- Popup UI for chat

## Installation
1. Run `npm install` in this folder
2. Build with your React toolchain (e.g., Vite, Webpack, or Parcel)
3. Load the `extension` folder as an unpacked extension in Chrome

## Backend
Uses your existing AgoraLearn backend API.

---

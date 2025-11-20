import ChatApp from "./ChatApp";

function uuidv4() {
  // Simple UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const API_BASE = "https://agora-learn-uv27.vercel.app"; // TODO: replace after backend deploy

function App() {
  return <ChatApp />;
}

export default App;
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
            {rawResponse}
          </pre>
        </section>
      )}
    </div>
  );
}

export default App;

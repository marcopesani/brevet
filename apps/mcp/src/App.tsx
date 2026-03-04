import { useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type HelloPayload = {
  tool: string;
  result: string;
};

function App() {
  const [name, setName] = useState("world");
  const [result, setResult] = useState<string>("No invocation yet.");
  const [isLoading, setIsLoading] = useState(false);

  const invokeHello = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`/api/hello?name=${encodeURIComponent(name)}`);
      const payload = (await response.json()) as HelloPayload;
      setResult(payload.result);
    } catch {
      setResult("Failed to invoke hello tool. Is MCP server running?");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="container">
      <h1>MCP Hello World</h1>
      <p>Invoke the MCP server hello tool from this Vite+React client.</p>

      <form className="card" onSubmit={invokeHello}>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="world"
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Invoking..." : "Invoke hello tool"}
        </button>
      </form>

      <section className="card">
        <h2>Result</h2>
        <pre>{result}</pre>
      </section>
    </main>
  );
}

export default App;

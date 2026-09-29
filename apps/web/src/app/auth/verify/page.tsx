export default function VerifyPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Check your email — Campaign Messaging</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0f172a; color: #f8fafc;
            min-height: 100vh; display: flex; align-items: center; justify-content: center;
          }
          .card {
            background: #1e293b; border: 1px solid #334155;
            border-radius: 12px; padding: 2rem; max-width: 400px; text-align: center;
          }
          h1 { font-size: 1.5rem; margin-bottom: 0.75rem; }
          p { color: #94a3b8; line-height: 1.6; }
          .icon { font-size: 2.5rem; margin-bottom: 1rem; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">✉️</div>
          <h1>Check your email</h1>
          <p>We sent a magic link to your inbox. Click it to sign in — it expires in 10 minutes.</p>
        </div>
      </body>
    </html>
  );
}

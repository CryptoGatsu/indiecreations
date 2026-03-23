export default function Home() {
  return (
    <div className="container">
      
      {/* HERO */}
      <div className="hero">
        <img src="/logo.png" className="logo" alt="Indie Creations Logo" />

        <div className="title">
          Indie Creations
        </div>

        <div className="subtitle">
          Building experimental indie games powered by community feedback.
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/supporter">
            <button className="button">Access Playtests →</button>
          </a>

          <a href="/dashboard">
            <button className="button">View Feedback Dashboard</button>
          </a>
        </div>
      </div>

      {/* ABOUT SECTION */}
      <div className="card" style={{ marginTop: 60 }}>
        <h2 style={{ fontSize: 32, marginBottom: 10 }}>🌌 Indie Creations</h2>

        <p style={{ lineHeight: 1.6 }}>
          Indie Creations is a small, independent development initiative focused on building unique, gameplay-first experiences from the ground up. Every project is driven by experimentation, learning, and a commitment to actually finishing and releasing games—no matter the size.
        </p>

        <p style={{ marginTop: 20 }}>
          <strong>The goal is simple:</strong><br />
          Create fun, evolving games while documenting the journey from idea → playable → polished.
        </p>

        <h3 style={{ marginTop: 30 }}>🪙 Indie $creations Coin</h3>

        <p>
          As part of the broader ecosystem, Indie Creations also experiments with digital assets tied to the brand.
        </p>

        <p style={{ marginTop: 10 }}>
          <strong>Contract Address (CA):</strong><br />
          <span style={{ fontFamily: "monospace", fontSize: 14 }}>
            8QaHW7cj1HeCWmqtUxMrDFTjLR8GPRaiCG9zRnoEpump
          </span>
        </p>

        <h3 style={{ marginTop: 30 }}>🚀 Vision</h3>

        <ul style={{ lineHeight: 1.8 }}>
          <li>Build and ship multiple indie games</li>
          <li>Continuously improve systems, design, and feel</li>
          <li>Share progress openly</li>
          <li>Blend creativity with emerging tech (where it makes sense)</li>
        </ul>
      </div>

    </div>
  );
}
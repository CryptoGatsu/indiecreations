export default function Home() {
  return (
    <div className="container">
      <div className="hero">
        <img src="/logo.png" className="logo" />

        <div className="title">
          Indie Creations
        </div>

        <div className="subtitle">
          Building experimental indie games powered by community feedback.
        </div>

        <a href="/supporter">
          <button className="button">Enter Supporter Portal</button>
        </a>
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("/api/feedback")
      .then((res) => res.json())
      .then(setData);
  }, []);

  return (
    <div className="container">
      <h1 className="title">Feedback Dashboard</h1>

      {data.length === 0 && <p>No feedback yet.</p>}

      {data.map((item, index) => (
        <div key={index} className="card">
          <p><strong>Wallet:</strong> {item.wallet}</p>
          <p><strong>Feedback:</strong> {item.feedback}</p>
          <p style={{ fontSize: 12, color: "#666" }}>
            {new Date(item.date).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
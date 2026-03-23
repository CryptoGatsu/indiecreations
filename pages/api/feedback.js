let feedbackStore = [];

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { wallet, feedback, signature } = req.body;

    const entry = {
      wallet,
      feedback,
      signature,
      date: new Date().toISOString(),
    };

    feedbackStore.unshift(entry);

    console.log("Stored feedback:", entry);

    return res.status(200).json({ success: true });
  }

  if (req.method === "GET") {
    return res.status(200).json(feedbackStore);
  }
}
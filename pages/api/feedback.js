
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  const { wallet, feedback, signature } = req.body;

  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD
    }
  });

  await transporter.sendMail({
    from: 'Indie Creations',
    to: 'indiecreationsdev@outlook.com',
    subject: 'New Feedback',
    text: `Wallet: ${wallet}\nFeedback: ${feedback}\nSignature: ${signature}`
  });

  res.status(200).json({ success: true });
}

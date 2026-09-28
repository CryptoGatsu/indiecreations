import { useEffect, useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import useProfile from './useProfile';
import { shownName } from '../lib/profileRules';

// Header: your picture and name when signed in (to your profile), otherwise "Sign in".
export default function AccountButton() {
  const { address, profile, loading } = useProfile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && !loading && address) {
    return (
      <Link href="/profile" className="account-chip" title="Your profile">
        <Avatar address={address} profile={profile} size={28} />
        <span>{shownName(profile, address)}</span>
      </Link>
    );
  }
  return (
    <Link href="/profile" className="btn btn-primary btn-sm">
      Sign in
    </Link>
  );
}

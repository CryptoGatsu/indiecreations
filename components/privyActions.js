import { createContext, useContext } from 'react';

// What the Privy sign-in can do, for components that must also work without Privy (it is null then):
// { login(), logout(), linkWallet(), linkEmail(), connectWallet() }. Provided by components/PrivyProviders.js.
export const PrivyActionsContext = createContext(null);
export const usePrivyActions = () => useContext(PrivyActionsContext);

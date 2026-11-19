import { AccountCreator } from './parts/AccountCreator';

/** Chair + Incharge: create panel-member ("panelist") sign-in accounts. */
export default function Members(): React.JSX.Element {
  return <AccountCreator role="panel_member" />;
}

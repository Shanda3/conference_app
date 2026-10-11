import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import Planner from "./planner";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <Planner user={user ? {displayName:user.displayName} : null} signInPath={chatGPTSignInPath("/")} />;
}

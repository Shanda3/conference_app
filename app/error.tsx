"use client";

export default function PlannerError({reset}:{error:Error & {digest?:string};reset:()=>void}) {
  return <main className="loading" role="alert"><h1>We couldn’t open this view.</h1><p>Try again to reload this view. Unsaved edits may need to be entered again.</p><button className="button primary" onClick={reset}>Try again</button><a className="button secondary" href="/">Return to planner</a></main>;
}

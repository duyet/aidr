import type * as React from "react";

type IconProps = React.HTMLAttributes<SVGElement>;

/** Empty avatar icon for sign-in button */
export const UserEmpty = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M20 21c0-4.4-3.6-8-8-8s-8 3.6-8 8" />
  </svg>
);

export default {
  UserEmpty,
};

// Utility functions for opportunity management
// A null/empty deadline means the opportunity is "Open" — it never
// auto-closes based on date, only via the manually_disabled flag.

export const isDeadlinePassed = (deadline: string | null): boolean => {
  if (!deadline) return false; // Open — no deadline, never passes
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(23, 59, 59, 999); // Set to end of deadline day
  const today = new Date();
  return today > deadlineDate; // Only close AFTER the deadline day has fully passed
};

export const formatDeadline = (deadline: string | null): string => {
  if (!deadline) return 'Open — No Deadline';
  const deadlineDate = new Date(deadline);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  return deadlineDate.toLocaleDateString('en-US', options);
};

export const getOpportunityStatus = (deadline: string | null, manuallyDisabled: boolean): 'open' | 'closed' => {
  if (manuallyDisabled) return 'closed';
  return isDeadlinePassed(deadline) ? 'closed' : 'open';
};

export const getDaysUntilDeadline = (deadline: string | null): number => {
  if (!deadline) return Infinity; // Open — no deadline to count down to
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(23, 59, 59, 999); // End of deadline day
  const today = new Date();
  const diffTime = deadlineDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const getDeadlineStatus = (deadline: string | null): {
  status: 'expired' | 'urgent' | 'normal';
  message: string;
} => {
  if (!deadline) {
    return { status: 'normal', message: 'Open — No Deadline' };
  }

  const days = getDaysUntilDeadline(deadline);

  if (days < 0) {
    return { status: 'expired', message: 'Expired' };
  } else if (days === 0) {
    return { status: 'urgent', message: 'Closes Today!' };
  } else if (days <= 7) {
    return { status: 'urgent', message: `${days} day${days > 1 ? 's' : ''} left` };
  } else {
    return { status: 'normal', message: formatDeadline(deadline) };
  }
};

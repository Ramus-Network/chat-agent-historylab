// Utility functions for formatting

/**
 * Format timestamp for message display
 * @param date Date object to format
 * @returns Formatted time string (hours:minutes)
 */
export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * Format date range from query parameters 
 * @param args Object containing date parameters
 * @returns Formatted date range string
 */
export const formatDateRange = (args: any): string => {
  // Check if args is defined before destructuring
  if (!args) return "";
  
  // Define variables with explicit types and default values
  const authored_start_year_month = args.authored_start_year_month as string | undefined;
  const authored_end_year_month = args.authored_end_year_month as string | undefined;
  const authored_start_year_month_day = args.authored_start_year_month_day as string | undefined;
  const authored_end_year_month_day = args.authored_end_year_month_day as string | undefined;

  // Assign to new variables for clarity
  const start_day = authored_start_year_month_day;
  const end_day = authored_end_year_month_day;
  const start_month = authored_start_year_month;
  const end_month = authored_end_year_month;

  if (start_day || end_day) {
    if (start_day && end_day && start_day === end_day) return `(${start_day})`;
    if (start_day && end_day) return `(${start_day} to ${end_day})`;
    if (start_day) return `(from ${start_day})`;
    if (end_day) return `(until ${end_day})`;
  } else if (start_month || end_month) {
    if (start_month && end_month && start_month === end_month) return `(${start_month})`;
    if (start_month && end_month) return `(${start_month} to ${end_month})`;
    if (start_month) return `(from ${start_month})`;
    if (end_month) return `(until ${end_month})`;
  }
  return ""; // No date range provided
}; 
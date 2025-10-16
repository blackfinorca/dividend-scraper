import React from 'react';
import { cn } from '../../utils/cn';

const ApplicationFooter = ({ className }) => (
  <footer
    className={cn(
      'border-t border-border bg-card text-center text-xs text-muted-foreground py-4',
      className
    )}
  >
    Made by BlackFinOrca
  </footer>
);

export default ApplicationFooter;

import React from 'react';
import { cn } from '../../utils/cn';
import Icon from '../AppIcon';

const ApplicationFooter = ({ className }) => (
  <footer
    className={cn(
      'border-t border-border bg-card text-center text-xs text-muted-foreground py-4',
      className
    )}
  >
    <div className="flex items-center justify-center gap-3">
      <span>Made by BlackFinOrca</span>
      <a
        href="https://buymeacoffee.com/blackfinorca"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
      >
        <Icon name="Coffee" size={14} strokeWidth={1.8} />
        <span>Support us</span>
      </a>
    </div>
  </footer>
);

export default ApplicationFooter;

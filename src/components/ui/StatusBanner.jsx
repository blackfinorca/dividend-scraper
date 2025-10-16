import React, { useState, useEffect } from 'react';
import Button from './Button';
import Icon from '../AppIcon';

const StatusBanner = ({ 
  message, 
  type = 'info', 
  onDismiss,
  autoHide = false,
  autoHideDelay = 5000,
  className = ""
}) => {
  const [isVisible, setIsVisible] = useState(!!message);

  useEffect(() => {
    setIsVisible(!!message);
    
    if (message && autoHide) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoHideDelay);
      
      return () => clearTimeout(timer);
    }
  }, [message, autoHide, autoHideDelay]);

  const handleDismiss = () => {
    setIsVisible(false);
    if (onDismiss) {
      onDismiss();
    }
  };

  if (!isVisible || !message) {
    return null;
  }

  const getStatusConfig = () => {
    switch (type) {
      case 'error':
        return {
          bgColor: 'bg-error/10',
          borderColor: 'border-error/20',
          textColor: 'text-error',
          iconName: 'AlertCircle'
        };
      case 'warning':
        return {
          bgColor: 'bg-warning/10',
          borderColor: 'border-warning/20',
          textColor: 'text-warning',
          iconName: 'AlertTriangle'
        };
      case 'success':
        return {
          bgColor: 'bg-success/10',
          borderColor: 'border-success/20',
          textColor: 'text-success',
          iconName: 'CheckCircle'
        };
      default: // info
        return {
          bgColor: 'bg-accent/10',
          borderColor: 'border-accent/20',
          textColor: 'text-accent',
          iconName: 'Info'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div 
      className={`
        ${config?.bgColor} 
        ${config?.borderColor} 
        border rounded-lg p-4 mb-4 
        animate-slide-in
        ${className}
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <Icon 
            name={config?.iconName}
            size={20}
            color={`var(--color-${type})`}
            strokeWidth={2}
            className="flex-shrink-0 mt-0.5"
          />
          <div className="flex-1">
            <p className={`text-sm font-medium ${config?.textColor}`}>
              {message}
            </p>
            {type === 'error' && (
              <p className="text-xs text-muted-foreground mt-1">
                Please check your input parameters and try again.
              </p>
            )}
            {type === 'warning' && (
              <p className="text-xs text-muted-foreground mt-1">
                This may affect the accuracy of your analysis results.
              </p>
            )}
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="hover:bg-muted hover-transition flex-shrink-0 ml-2"
          aria-label="Dismiss notification"
        >
          <Icon 
            name="X" 
            size={16} 
            color="currentColor"
            strokeWidth={2}
          />
        </Button>
      </div>
    </div>
  );
};

export default StatusBanner;
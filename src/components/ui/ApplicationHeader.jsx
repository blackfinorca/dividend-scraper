import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from '../AppIcon';
import Button from './Button';
import { cn } from '../../utils/cn';

const ApplicationHeader = ({ theme = 'light', onThemeToggle, className = '' }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    {
      label: 'Dashboard',
      to: '/',
      isActive: location.pathname === '/' || location.pathname.startsWith('/dashboard'),
    },
    {
      label: 'Analyzer',
      to: '/dividend-capture-analyzer',
      isActive: location.pathname.startsWith('/dividend-capture-analyzer'),
    },
    {
      label: 'Portfolio',
      to: '/portfolio',
      isActive: location.pathname.startsWith('/portfolio'),
    },
  ];

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] bg-white/70 dark:bg-slate-900/80 backdrop-blur-md border-b border-white/60 dark:border-slate-700/70 shadow-sm',
        className
      )}
    >
      <div className="flex items-center justify-between h-16 px-6">
        {/* Brand Section */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-lg">
            <Icon 
              name="TrendingUp" 
              size={20} 
              color="white" 
              strokeWidth={2}
            />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-foreground leading-tight">
              SG Dividend Capture
            </h1>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-1">
          {navLinks.map((item) => (
            <Button
              key={item.to}
              variant="ghost"
              size="sm"
              asChild
              className={cn(
                'hover:text-primary hover:bg-muted',
                item.isActive ? 'text-primary bg-muted font-semibold' : 'text-muted-foreground'
              )}
            >
              <Link to={item.to} aria-current={item.isActive ? 'page' : undefined}>
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>

        {/* Utility Controls */}
        <div className="flex items-center space-x-2">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onThemeToggle}
            className="hover:bg-muted hover-transition"
            aria-label="Toggle theme"
          >
            <Icon 
              name={theme === 'light' ? 'Moon' : 'Sun'} 
              size={18} 
              color="currentColor"
              strokeWidth={2}
            />
          </Button>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMobileMenu}
            className="md:hidden hover:bg-muted hover-transition"
            aria-label="Toggle menu"
          >
            <Icon 
              name={mobileMenuOpen ? 'X' : 'Menu'} 
              size={20} 
              color="currentColor"
              strokeWidth={2}
            />
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-card border-t border-border animate-slide-in">
          <nav className="px-6 py-4 space-y-2">
            {navLinks.map((item) => (
              <Button
                key={item.to}
                variant="ghost"
                size="sm"
                fullWidth
                asChild
                className={cn(
                  'justify-start hover:text-primary hover:bg-muted',
                  item.isActive ? 'text-primary bg-muted/70 font-semibold' : 'text-muted-foreground'
                )}
              >
                <Link to={item.to} onClick={handleNavClick} aria-current={item.isActive ? 'page' : undefined}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
};

export default ApplicationHeader;

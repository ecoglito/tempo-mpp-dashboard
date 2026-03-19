"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

function AnimatedDigits({
  value,
  decimals = 0,
  prefix = "",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
}) {
  const spring = useSpring(0, {
    stiffness: 50,
    damping: 30,
    mass: 1,
  });

  const display = useTransform(spring, (v) => {
    const num = Math.max(0, v);
    if (decimals > 0) {
      return prefix + num.toFixed(decimals);
    }
    return (
      prefix +
      Math.round(num).toLocaleString("en-US")
    );
  });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span>{display}</motion.span>;
}

export function AnimatedCounter({
  value,
  className = "",
  prefix = "",
  decimals = 0,
}: AnimatedCounterProps) {
  return (
    <span className={className}>
      <AnimatedDigits value={value} decimals={decimals} prefix={prefix} />
    </span>
  );
}

// Live incrementing counter that ticks up based on a rate
export function LiveCounter({
  rate,
  className = "",
  label,
}: {
  rate: number; // items per second
  className?: string;
  label?: string;
}) {
  const [count, setCount] = useState(0);
  const rateRef = useRef(rate);
  const startTimeRef = useRef(Date.now());
  const accumulatedRef = useRef(0);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    accumulatedRef.current = 0;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const newCount = Math.floor(rateRef.current * elapsed);
      if (newCount !== accumulatedRef.current) {
        accumulatedRef.current = newCount;
        setCount(newCount);
      }
    }, 50); // Smooth 20fps updates

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={className}>
      {label && (
        <p className="text-sm text-zinc-500 mb-1">{label}</p>
      )}
      <AnimatedCounter value={count} className="tabular-nums" />
    </div>
  );
}

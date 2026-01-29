"use client";

import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";

export default function Loader() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen w-full bg-background/50 backdrop-blur-sm z-50 fixed top-0 left-0">
            <div className="relative">
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 0, 0],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    className="relative z-10"
                >
                    <ShoppingBag className="w-16 h-16 text-primary" />
                </motion.div>

                <motion.div
                    animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    className="absolute top-0 left-0 w-16 h-16 bg-primary/20 rounded-full blur-xl"
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mt-6 flex flex-col items-center gap-2"
            >
                <h3 className="text-xl font-semibold tracking-tight text-primary">Prostore</h3>
                <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            animate={{
                                y: [0, -6, 0],
                                opacity: [0.5, 1, 0.5],
                            }}
                            transition={{
                                duration: 1,
                                repeat: Infinity,
                                delay: i * 0.2,
                                ease: "easeInOut",
                            }}
                            className="w-2 h-2 rounded-full bg-primary/60"
                        />
                    ))}
                </div>
            </motion.div>
        </div>
    );
}

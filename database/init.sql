CREATE DATABASE IF NOT EXISTS fredai_db;
USE fredai_db;

CREATE TABLE IF NOT EXISTS chat_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255),
    message_type ENUM('user', 'bot', 'image') NOT NULL,
    content TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id)
);

CREATE TABLE IF NOT EXISTS suggestions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    suggestion TEXT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email_sent BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS faq_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(255) NOT NULL,
    display_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS faq_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    display_order INT DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES faq_categories(id)
);

INSERT INTO faq_categories (category_name, display_order) VALUES
('Brand', 1),
('Ordering & Shipping', 2),
('Product', 3),
('Returns & Support', 4);

INSERT INTO faq_items (category_id, question, answer, display_order) VALUES
(1, 'What is Impact Ventures?', 'Impact Ventures is a brand that curates premium colognes and AI models, blending craftsmanship with cutting-edge innovation. We celebrate timeless elegance, luxury, and quality.', 1),
(1, 'Where are you based?', 'We operate online, serving customers worldwide with exclusive fragrances and AI-powered product recommendations.', 2),
(2, 'How can I place an order?', 'Simply browse our collection, select your favorite cologne, and proceed to checkout. We accept major payment methods for a seamless experience.', 1),
(2, 'Do you offer international shipping?', 'Yes! We ship globally. Shipping rates and delivery times vary based on location.', 2),
(2, 'How long does shipping take?', 'Orders are processed within 1-2 business days. Delivery typically takes 5-10 business days, depending on your location.', 3),
(3, 'Are your colognes made with natural ingredients?', 'We prioritize high-quality, ethically sourced ingredients. Each fragrance is carefully crafted with a blend of natural and refined synthetics for longevity and depth.', 1),
(3, 'How should I apply cologne for best results?', 'Apply to pulse points—wrists, neck, and behind the ears—for a lasting, well-balanced scent. Avoid rubbing the fragrance after application.', 2),
(3, 'Do you have a loyalty program?', 'Yes! Our members enjoy exclusive discounts, early access to new releases, and personalized recommendations from our AI model based on their fragrance preferences.', 3),
(3, 'Do you offer samples?', 'We do not provide sample packs right now', 4),
(4, 'Can I return or exchange a cologne?', 'We accept returns within 30 days of purchase if the product is unopened and unused. Contact our support team for assistance.', 1),
(4, 'My order arrived damaged. What should I do?', 'If your package arrives damaged, please reach out to us with photos, and we\'ll arrange a replacement or refund.', 2);

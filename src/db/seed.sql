-- Insert test categories
INSERT INTO categories (name, description) VALUES
('Web Development', 'Web development services'),
('Mobile Development', 'Mobile app development services'),
('Design', 'UI/UX design services');

-- Insert test users
INSERT INTO users (username, email, password, role) VALUES
('admin', 'admin@example.com', '$2b$10$your-hashed-password', 'admin'),
('customer1', 'customer1@example.com', '$2b$10$your-hashed-password', 'customer'),
('freelancer1', 'freelancer1@example.com', '$2b$10$your-hashed-password', 'freelancer');

-- Insert test orders
INSERT INTO orders (title, description, budget, deadline, status, category_id, customer_id) VALUES
('Website Development', 'Need a website for my business', 1000.00, '2024-04-01', 'open', 1, 2),
('Mobile App Design', 'Looking for a designer for my app', 500.00, '2024-03-15', 'open', 3, 2); 
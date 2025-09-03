import React, { useState } from 'react';
import { useMutation, gql } from '@apollo/client';
import '../styles/register.css';

const VALIDATION_RULES = {
  PASSWORD_MIN_LENGTH: 8,
  COLORADO_EMAIL_SUFFIX: '@colorado.edu'
};

const ERROR_MESSAGES = {
  PASSWORDS_DONT_MATCH: 'Passwords do not match',
  PASSWORD_TOO_SHORT: `Password must be at least ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} characters long`,
  INVALID_EMAIL: `Email must be a ${VALIDATION_RULES.COLORADO_EMAIL_SUFFIX} email`
};

const REGISTER_MUTATION = gql`
  mutation Register($username: String!, $email: String!, $password: String!, $firstName: String, $lastName: String) {
    register(username: $username, email: $email, password: $password, firstName: $firstName, lastName: $lastName) {
      success
      message
      token
      user {
        id
        username
        email
        firstName
        lastName
      }
    }
  }
`;

const validateForm = (formData) => {
  if (formData.password !== formData.confirmPassword) {
    return ERROR_MESSAGES.PASSWORDS_DONT_MATCH;
  }
  
  if (formData.password.length < VALIDATION_RULES.PASSWORD_MIN_LENGTH) {
    return ERROR_MESSAGES.PASSWORD_TOO_SHORT;
  }
  
  if (!formData.email.endsWith(VALIDATION_RULES.COLORADO_EMAIL_SUFFIX)) {
    return ERROR_MESSAGES.INVALID_EMAIL;
  }
  
  return null;
};

const FORM_FIELDS = [
  {
    id: 'username',
    name: 'username',
    type: 'text',
    label: 'Username',
    required: true
  },
  {
    id: 'email',
    name: 'email',
    type: 'email',
    label: 'Email',
    required: true
  },
  {
    id: 'firstName',
    name: 'firstName',
    type: 'text',
    label: 'First Name',
    required: false
  },
  {
    id: 'lastName',
    name: 'lastName',
    type: 'text',
    label: 'Last Name',
    required: false
  },
  {
    id: 'password',
    name: 'password',
    type: 'password',
    label: 'Password',
    required: true
  },
  {
    id: 'confirmPassword',
    name: 'confirmPassword',
    type: 'password',
    label: 'Confirm Password',
    required: true
  }
];

const FormField = ({ field, value, onChange }) => (
  <div className="form-group">
    <label htmlFor={field.id}>{field.label}:</label>
    <input
      type={field.type}
      id={field.id}
      name={field.name}
      value={value}
      onChange={onChange}
      required={field.required}
    />
  </div>
);

const Register = ({ onRegisterSuccess }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });
  const [error, setError] = useState('');

  const [register, { loading }] = useMutation(REGISTER_MUTATION, {
    
    onCompleted: (data) => {
 
      if (data.register.success) {
        localStorage.setItem('authToken', data.register.token);
        localStorage.setItem('user', JSON.stringify(data.register.user));
        setError('');
        onRegisterSuccess(data.register.user);
        window.location.href = '/login';
      } else {
        setError(data.register.message);
      }
    },
    onError: (error) => {
      setError(error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const validationError = validateForm(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    register({
      variables: {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName
      }
    });
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="register-container">
      <h2>Register</h2>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleSubmit}>
        {FORM_FIELDS.map(field => (
          <FormField
            key={field.id}
            field={field}
            value={formData[field.name]}
            onChange={handleChange}
          />
        ))}
        <button type="submit" disabled={loading}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
    </div>
  );
}

export default Register;